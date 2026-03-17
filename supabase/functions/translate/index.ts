const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL_TIMEOUT_MS = 20_000;
const DEFAULT_PROVIDER = 'openai-compatible';
const DEFAULT_MODEL_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_MODEL_NAME = 'deepseek-ai/DeepSeek-V3';

type Provider = 'anthropic' | 'openai' | 'openai-compatible';

const toProvider = (value: string | undefined): Provider => {
  const normalized = String(value || DEFAULT_PROVIDER).trim().toLowerCase();
  if (normalized === 'anthropic') {
    return 'anthropic';
  }
  if (normalized === 'openai-compatible') {
    return 'openai-compatible';
  }
  return 'openai';
};

const normalizeOpenAICompletionsUrl = (apiUrl: string) => {
  const trimmed = (apiUrl || DEFAULT_MODEL_API_URL).replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/chat/completions') || trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
};

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });

const summarizeText = (value: string) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '<empty>';
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
};

const extractErrorMessage = (payload: any) => {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }
  if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message.trim();
  }
  return '';
};

const readJsonResponse = async (response: Response) => {
  const raw = await response.text();
  if (!raw.trim()) {
    return { json: {}, raw };
  }

  try {
    return { json: JSON.parse(raw), raw };
  } catch {
    return { json: null, raw };
  }
};

const extractOpenAIContent = (payload: any) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim();
  }
  return '';
};

const extractAnthropicContent = (payload: any) =>
  Array.isArray(payload?.content)
    ? payload.content
        .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
        .join('')
        .trim()
    : '';

const buildSystemPrompt = (payload: any) => {
  const translationFrom = payload?.translation_from || 'auto';
  const translationTo = payload?.translation_to || 'en';
  const translationMode = payload?.translation_mode || 'auto';
  const gameScene = payload?.game_scene || 'general';
  const dailyMode = Boolean(payload?.daily_mode);

  return [
    'You are a concise in-game chat translator.',
    `Translate from ${translationFrom} to ${translationTo}.`,
    `Tone mode: ${translationMode}.`,
    `Game scene: ${gameScene}.`,
    `Daily mode: ${dailyMode ? 'enabled' : 'disabled'}.`,
    'Output only translated text without explanations.',
    'Keep tactical terms short and send-ready.',
  ].join(' ');
};

const requestModel = async ({
  provider,
  apiKey,
  apiUrl,
  modelName,
  systemPrompt,
  text,
}: {
  provider: Provider;
  apiKey: string;
  apiUrl: string;
  modelName: string;
  systemPrompt: string;
  text: string;
}) => {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort('MODEL_TIMEOUT'), MODEL_TIMEOUT_MS);

  try {
    if (provider === 'anthropic') {
      const response = await fetch(apiUrl || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model: modelName,
          system: systemPrompt,
          max_tokens: 140,
          temperature: 0.4,
          messages: [{ role: 'user', content: text }],
        }),
      });

      const { json: body, raw } = await readJsonResponse(response);
      if (!response.ok) {
        throw {
          status: response.status,
          message:
            extractErrorMessage(body) ||
            `Anthropic request failed (HTTP ${response.status}): ${summarizeText(raw)}`,
        };
      }

      const translatedText = extractAnthropicContent(body);
      if (!translatedText) {
        throw { status: 502, message: 'Empty model response' };
      }

      return translatedText;
    }

    const response = await fetch(normalizeOpenAICompletionsUrl(apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.4,
        max_tokens: 140,
      }),
    });

    const { json: body, raw } = await readJsonResponse(response);
    if (!response.ok) {
      throw {
        status: response.status,
        message:
          extractErrorMessage(body) ||
          `Model request failed (HTTP ${response.status}): ${summarizeText(raw)}`,
      };
    }

    const translatedText = extractOpenAIContent(body);
    if (!translatedText) {
      throw { status: 502, message: 'Empty model response' };
    }

    return translatedText;
  } finally {
    clearTimeout(timer);
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    if (req.method !== 'POST') {
      return jsonResponse(405, { message: 'Method not allowed', trace_id: traceId });
    }

    const payload = await req.json().catch(() => ({}));
    const text = String(payload?.text || '').trim();
    if (!text) {
      return jsonResponse(400, { message: 'text is required', trace_id: traceId });
    }

    const provider = toProvider(Deno.env.get('MODEL_PROVIDER'));
    const apiKey = Deno.env.get('MODEL_API_KEY') || '';
    const apiUrl = Deno.env.get('MODEL_API_URL') || DEFAULT_MODEL_API_URL;
    const modelName = Deno.env.get('MODEL_NAME') || DEFAULT_MODEL_NAME;

    if (!apiKey) {
      return jsonResponse(500, {
        message: 'MODEL_API_KEY is missing',
        trace_id: traceId,
      });
    }

    const translatedText = await requestModel({
      provider,
      apiKey,
      apiUrl,
      modelName,
      systemPrompt: buildSystemPrompt(payload),
      text,
    });

    const latencyMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        trace_id: traceId,
        provider,
        model: modelName,
        latency_ms: latencyMs,
        text_length: text.length,
      }),
    );

    return jsonResponse(200, {
      translated_text: translatedText,
      model: modelName,
      latency_ms: latencyMs,
      trace_id: traceId,
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || String(error.message || '').includes('timeout'));
    if (isTimeout) {
      return jsonResponse(504, {
        message: 'Model request timed out',
        trace_id: traceId,
      });
    }

    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      Number.isInteger((error as { status?: number }).status)
        ? Number((error as { status?: number }).status)
        : 500;

    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: string }).message === 'string'
        ? String((error as { message?: string }).message)
        : error instanceof Error
          ? error.message
          : 'Internal error';

    console.error(
      JSON.stringify({
        trace_id: traceId,
        status,
        message,
      }),
    );

    return jsonResponse(status, {
      message,
      trace_id: traceId,
    });
  }
});
