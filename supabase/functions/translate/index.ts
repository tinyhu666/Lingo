const corsHeaders = {
  'Content-Type': 'application/json',
};

const MODEL_TIMEOUT_MS = 20_000;

const toProvider = (value: string | undefined) => {
  const normalized = String(value || 'openai').trim().toLowerCase();
  if (normalized === 'anthropic') {
    return 'anthropic';
  }
  if (normalized === 'openai-compatible') {
    return 'openai-compatible';
  }
  return 'openai';
};

const normalizeOpenAICompletionsUrl = (apiUrl: string) => {
  const trimmed = (apiUrl || 'https://api.openai.com/v1/chat/completions').replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/chat/completions') || trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const text = String(payload?.text || '').trim();
    if (!text) {
      return new Response(JSON.stringify({ message: 'text is required' }), { status: 400, headers: corsHeaders });
    }

    const provider = toProvider(Deno.env.get('MODEL_PROVIDER'));
    const apiKey = Deno.env.get('MODEL_API_KEY') || '';
    const apiUrl = Deno.env.get('MODEL_API_URL') || '';
    const modelName = Deno.env.get('MODEL_NAME') || 'gpt-4.1-mini';

    if (!apiKey) {
      return new Response(JSON.stringify({ message: 'MODEL_API_KEY is missing' }), { status: 500, headers: corsHeaders });
    }

    const translationFrom = payload?.translation_from || 'auto';
    const translationTo = payload?.translation_to || 'en';
    const translationMode = payload?.translation_mode || 'auto';
    const gameScene = payload?.game_scene || 'general';
    const dailyMode = Boolean(payload?.daily_mode);

    const systemPrompt = [
      'You are a concise in-game chat translator.',
      `Translate from ${translationFrom} to ${translationTo}.`,
      `Tone mode: ${translationMode}.`,
      `Game scene: ${gameScene}.`,
      `Daily mode: ${dailyMode ? 'enabled' : 'disabled'}.`,
      'Output only translated text without explanations.',
      'Keep tactical terms short and send-ready.',
    ].join(' ');

    const traceId = crypto.randomUUID();
    const startedAt = Date.now();
    let translatedText = '';

    if (provider === 'openai' || provider === 'openai-compatible') {
      const url = normalizeOpenAICompletionsUrl(apiUrl);
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort('MODEL_TIMEOUT'), MODEL_TIMEOUT_MS);

      const response = await fetch(url, {
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
      }).finally(() => clearTimeout(timer));

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return new Response(
          JSON.stringify({ message: body?.error?.message || body?.message || 'Model request failed' }),
          { status: response.status, headers: corsHeaders },
        );
      }

      const message = body?.choices?.[0]?.message || {};
      translatedText = String(message?.content || '').trim();
    } else if (provider === 'anthropic') {
      const anthropicUrl = apiUrl || 'https://api.anthropic.com/v1/messages';
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort('MODEL_TIMEOUT'), MODEL_TIMEOUT_MS);
      const response = await fetch(anthropicUrl, {
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
      }).finally(() => clearTimeout(timer));

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return new Response(
          JSON.stringify({ message: body?.error?.message || body?.message || 'Anthropic request failed' }),
          { status: response.status, headers: corsHeaders },
        );
      }
      translatedText = String(body?.content?.[0]?.text || '').trim();
    }

    if (!translatedText) {
      return new Response(JSON.stringify({ message: 'Empty model response' }), { status: 502, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        translated_text: translatedText,
        model: modelName,
        latency_ms: Date.now() - startedAt,
        trace_id: traceId,
      }),
      { headers: corsHeaders },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || String(error.message || '').includes('timeout'))
    ) {
      return new Response(
        JSON.stringify({ message: '翻译服务响应超时，请稍后重试。' }),
        { status: 504, headers: corsHeaders },
      );
    }
    return new Response(
      JSON.stringify({ message: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: corsHeaders },
    );
  }
});
