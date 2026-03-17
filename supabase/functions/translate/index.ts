const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const OPENAI_PATH = '/v1/chat/completions';
const ANTHROPIC_PATH = '/v1/messages';
const CONFIG_TABLE = 'app_runtime_config';
const CONFIG_KEY = 'translation_proxy';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 140;
const DEFAULT_TEMPERATURE = 0.4;

type Provider = 'anthropic' | 'openai' | 'openai-compatible';
type ConfigSource = 'database' | 'environment';

type RuntimeConfig = {
  enabled: boolean;
  provider: Provider;
  apiUrl: string;
  modelName: string;
  apiKeySecretName: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  source: ConfigSource;
  updatedAt: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toProvider = (value: unknown): Provider => {
  const normalized = String(value || 'openai-compatible').trim().toLowerCase();
  if (normalized === 'anthropic') {
    return 'anthropic';
  }
  if (normalized === 'openai') {
    return 'openai';
  }
  return 'openai-compatible';
};

const defaultApiUrl = (provider: Provider) =>
  provider === 'anthropic'
    ? 'https://api.anthropic.com/v1/messages'
    : 'https://api.siliconflow.cn/v1/chat/completions';

const normalizeOpenAICompletionsUrl = (apiUrl: string) => {
  const trimmed = (apiUrl || defaultApiUrl('openai-compatible')).replace(/\/+$/, '');
  if (trimmed.endsWith(OPENAI_PATH) || trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}${OPENAI_PATH}`;
};

const normalizeApiUrlByProvider = (apiUrl: unknown, provider: Provider) => {
  const trimmed = String(apiUrl || '').trim();
  if (!trimmed) {
    return defaultApiUrl(provider);
  }

  if (provider === 'anthropic' && trimmed.endsWith(OPENAI_PATH)) {
    return `${trimmed.slice(0, -OPENAI_PATH.length)}${ANTHROPIC_PATH}`;
  }

  if (provider !== 'anthropic' && trimmed.endsWith(ANTHROPIC_PATH)) {
    return `${trimmed.slice(0, -ANTHROPIC_PATH.length)}${OPENAI_PATH}`;
  }

  if (provider === 'anthropic') {
    return trimmed;
  }

  return normalizeOpenAICompletionsUrl(trimmed);
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
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

const parseRuntimeConfig = (
  candidate: unknown,
  source: ConfigSource,
  updatedAt: string | null = null,
): RuntimeConfig => {
  const record = isRecord(candidate) ? candidate : {};
  const provider = toProvider(record.provider);

  return {
    enabled: record.enabled !== false,
    provider,
    apiUrl: normalizeApiUrlByProvider(record.api_url, provider),
    modelName: String(record.model_name || 'deepseek-ai/DeepSeek-V3').trim() || 'deepseek-ai/DeepSeek-V3',
    apiKeySecretName:
      String(record.api_key_secret_name || 'MODEL_API_KEY').trim() || 'MODEL_API_KEY',
    timeoutMs: clampNumber(record.timeout_ms, DEFAULT_TIMEOUT_MS, 3_000, 120_000),
    maxTokens: clampNumber(record.max_tokens, DEFAULT_MAX_TOKENS, 1, 4_096),
    temperature: clampNumber(record.temperature, DEFAULT_TEMPERATURE, 0, 2),
    source,
    updatedAt,
  };
};

const environmentRuntimeConfig = () =>
  parseRuntimeConfig(
    {
      provider: Deno.env.get('MODEL_PROVIDER') || 'openai-compatible',
      api_url: Deno.env.get('MODEL_API_URL') || 'https://api.siliconflow.cn/v1/chat/completions',
      model_name: Deno.env.get('MODEL_NAME') || 'deepseek-ai/DeepSeek-V3',
      api_key_secret_name: Deno.env.get('MODEL_API_KEY_SECRET_NAME') || 'MODEL_API_KEY',
      timeout_ms: Deno.env.get('MODEL_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS,
      max_tokens: Deno.env.get('MODEL_MAX_TOKENS') || DEFAULT_MAX_TOKENS,
      temperature: Deno.env.get('MODEL_TEMPERATURE') || DEFAULT_TEMPERATURE,
      enabled: Deno.env.get('MODEL_ENABLED') !== 'false',
    },
    'environment',
  );

const runtimeConfigBaseUrl = () =>
  String(
    Deno.env.get('RUNTIME_CONFIG_SUPABASE_URL') ||
      Deno.env.get('SUPABASE_URL') ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');

const runtimeConfigServiceKey = () =>
  String(
    Deno.env.get('RUNTIME_CONFIG_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      '',
  ).trim();

const loadRuntimeConfigFromDatabase = async (): Promise<RuntimeConfig | null> => {
  const baseUrl = runtimeConfigBaseUrl();
  const serviceKey = runtimeConfigServiceKey();
  if (!baseUrl || !serviceKey) {
    return null;
  }

  const endpoint = `${baseUrl}/rest/v1/${CONFIG_TABLE}?select=value,updated_at&key=eq.${CONFIG_KEY}&limit=1`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  const { json: payload, raw } = await readJsonResponse(response);
  if (!response.ok) {
    console.error(
      JSON.stringify({
        scope: 'runtime_config',
        source: 'database',
        status: response.status,
        message: extractErrorMessage(payload) || summarizeText(raw),
      }),
    );
    return null;
  }

  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row?.value) {
    return null;
  }

  return parseRuntimeConfig(
    row.value,
    'database',
    typeof row.updated_at === 'string' ? row.updated_at : null,
  );
};

const resolveRuntimeConfig = async () => {
  const databaseConfig = await loadRuntimeConfigFromDatabase();
  return databaseConfig || environmentRuntimeConfig();
};

const resolveApiKey = (config: RuntimeConfig) =>
  String(Deno.env.get(config.apiKeySecretName) || '').trim();

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
  config,
  apiKey,
  systemPrompt,
  text,
}: {
  config: RuntimeConfig;
  apiKey: string;
  systemPrompt: string;
  text: string;
}) => {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort('MODEL_TIMEOUT'), config.timeoutMs);

  try {
    if (config.provider === 'anthropic') {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model: config.modelName,
          system: systemPrompt,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
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

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
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
    const config = await resolveRuntimeConfig();

    if (req.method === 'GET') {
      return jsonResponse(200, {
        enabled: config.enabled,
        provider: config.provider,
        model: config.modelName,
        api_url: config.apiUrl,
        config_source: config.source,
        updated_at: config.updatedAt,
        trace_id: traceId,
      });
    }

    if (req.method !== 'POST') {
      return jsonResponse(405, { message: 'Method not allowed', trace_id: traceId });
    }

    if (!config.enabled) {
      return jsonResponse(503, {
        message: 'Translation service is disabled',
        trace_id: traceId,
      });
    }

    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      return jsonResponse(500, {
        message: `Missing API key secret: ${config.apiKeySecretName}`,
        trace_id: traceId,
      });
    }

    const payload = await req.json().catch(() => ({}));
    const text = String(payload?.text || '').trim();
    if (!text) {
      return jsonResponse(400, { message: 'text is required', trace_id: traceId });
    }

    const translatedText = await requestModel({
      config,
      apiKey,
      systemPrompt: buildSystemPrompt(payload),
      text,
    });

    const latencyMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        trace_id: traceId,
        provider: config.provider,
        model: config.modelName,
        config_source: config.source,
        latency_ms: latencyMs,
        text_length: text.length,
      }),
    );

    return jsonResponse(200, {
      translated_text: translatedText,
      model: config.modelName,
      provider: config.provider,
      config_source: config.source,
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
