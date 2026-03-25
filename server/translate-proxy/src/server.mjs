import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  loadRuntimeConfig,
  persistRuntimeConfig,
  resolveApiKey,
  summarizeRuntimeConfig,
} from './runtime-config.mjs';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

const MAX_BODY_BYTES = 128 * 1024;

const jsonResponse = (res, status, payload) => {
  res.writeHead(status, corsHeaders);
  res.end(JSON.stringify(payload));
};

const summarizeText = (value) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '<empty>';
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
};

const extractErrorMessage = (payload) => {
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

const readJsonResponse = async (response) => {
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

const extractOpenAIContent = (payload) => {
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

const extractAnthropicContent = (payload) =>
  Array.isArray(payload?.content)
    ? payload.content
        .map((item) => (typeof item?.text === 'string' ? item.text : ''))
        .join('')
        .trim()
    : '';

const buildSystemPrompt = (payload) => {
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

const readJsonBody = async (req) => {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
};

const readBearerToken = (headerValue) => {
  const value = String(headerValue || '').trim();
  if (!value.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return value.slice(7).trim();
};

const requireAdminToken = (req) => {
  const configured = String(process.env.ADMIN_TOKEN || '').trim();
  if (!configured) {
    const error = new Error('ADMIN_TOKEN is not configured on server');
    error.status = 503;
    throw error;
  }

  const provided = readBearerToken(req.headers.authorization);
  if (!provided || provided !== configured) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
};

const validateClientKey = (req) => {
  const configured = String(process.env.BACKEND_PUBLIC_KEY || '').trim();
  if (!configured) {
    return;
  }

  const authToken = readBearerToken(req.headers.authorization);
  const apiKey = String(req.headers.apikey || '').trim();
  if (authToken === configured || apiKey === configured) {
    return;
  }

  const error = new Error('Invalid backend public key');
  error.status = 401;
  throw error;
};

const requestModel = async ({ config, apiKey, systemPrompt, text }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('MODEL_TIMEOUT')), config.timeout_ms);

  try {
    if (config.provider === 'anthropic') {
      const response = await fetch(config.api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model_name,
          system: systemPrompt,
          max_tokens: config.max_tokens,
          temperature: config.temperature,
          messages: [{ role: 'user', content: text }],
        }),
      });

      const { json: body, raw } = await readJsonResponse(response);
      if (!response.ok) {
        const error = new Error(
          extractErrorMessage(body) ||
            `Anthropic request failed (HTTP ${response.status}): ${summarizeText(raw)}`,
        );
        error.status = response.status;
        throw error;
      }

      const translatedText = extractAnthropicContent(body);
      if (!translatedText) {
        const error = new Error('Empty model response');
        error.status = 502;
        throw error;
      }

      return translatedText;
    }

    const response = await fetch(config.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model_name,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens,
      }),
    });

    const { json: body, raw } = await readJsonResponse(response);
    if (!response.ok) {
      const error = new Error(
        extractErrorMessage(body) ||
          `Model request failed (HTTP ${response.status}): ${summarizeText(raw)}`,
      );
      error.status = response.status;
      throw error;
    }

    const translatedText = extractOpenAIContent(body);
    if (!translatedText) {
      const error = new Error('Empty model response');
      error.status = 502;
      throw error;
    }

    return translatedText;
  } finally {
    clearTimeout(timer);
  }
};

const routeAdminRuntimeConfig = async (req, res, traceId) => {
  requireAdminToken(req);

  if (req.method === 'GET') {
    const config = await loadRuntimeConfig(process.env);
    return jsonResponse(res, 200, {
      ...summarizeRuntimeConfig(config),
      api_key_env_name: config.api_key_env_name,
      timeout_ms: config.timeout_ms,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      trace_id: traceId,
    });
  }

  if (req.method !== 'PUT') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  const currentConfig = await loadRuntimeConfig(process.env);
  const payload = await readJsonBody(req);
  const nextConfig = await persistRuntimeConfig(process.env, {
    ...currentConfig,
    ...(payload || {}),
  });

  return jsonResponse(res, 200, {
    message: 'Runtime config updated',
    ...summarizeRuntimeConfig(nextConfig),
    api_key_env_name: nextConfig.api_key_env_name,
    timeout_ms: nextConfig.timeout_ms,
    max_tokens: nextConfig.max_tokens,
    temperature: nextConfig.temperature,
    trace_id: traceId,
  });
};

const routeTranslate = async (req, res, traceId) => {
  const startedAt = Date.now();
  const config = await loadRuntimeConfig(process.env);

  if (req.method === 'GET') {
    return jsonResponse(res, 200, {
      ...summarizeRuntimeConfig(config),
      trace_id: traceId,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  validateClientKey(req);

  if (!config.enabled) {
    return jsonResponse(res, 503, {
      message: 'Translation service is disabled',
      trace_id: traceId,
    });
  }

  const payload = await readJsonBody(req);
  const text = String(payload?.text || '').trim();
  if (!text) {
    return jsonResponse(res, 400, { message: 'text is required', trace_id: traceId });
  }

  const apiKey = resolveApiKey(process.env, config);
  if (!apiKey) {
    return jsonResponse(res, 500, {
      message: `Missing API key env: ${config.api_key_env_name}`,
      trace_id: traceId,
    });
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
      model: config.model_name,
      config_source: config.source,
      latency_ms: latencyMs,
      text_length: text.length,
    }),
  );

  return jsonResponse(res, 200, {
    translated_text: translatedText,
    model: config.model_name,
    provider: config.provider,
    config_source: config.source,
    latency_ms: latencyMs,
    trace_id: traceId,
  });
};

const routeHealthz = async (res, traceId) => {
  const config = await loadRuntimeConfig(process.env);
  return jsonResponse(res, 200, {
    status: 'ok',
    enabled: config.enabled,
    provider: config.provider,
    model: config.model_name,
    trace_id: traceId,
  });
};

const server = createServer(async (req, res) => {
  const traceId = randomUUID();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/healthz') {
      await routeHealthz(res, traceId);
      return;
    }

    if (url.pathname === '/translate') {
      await routeTranslate(req, res, traceId);
      return;
    }

    if (url.pathname === '/admin/runtime-config') {
      await routeAdminRuntimeConfig(req, res, traceId);
      return;
    }

    jsonResponse(res, 404, {
      message: 'Not found',
      trace_id: traceId,
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? Number(error.status) : 500;
    const isTimeout =
      error?.name === 'AbortError' || String(error?.message || '').includes('MODEL_TIMEOUT');
    const message = isTimeout ? 'Model request timed out' : error?.message || 'Internal error';

    console.error(
      JSON.stringify({
        trace_id: traceId,
        status,
        message,
      }),
    );

    jsonResponse(res, isTimeout ? 504 : status, {
      message,
      trace_id: traceId,
    });
  }
});

const port = Number.parseInt(process.env.PORT || '8787', 10);

server.listen(port, '0.0.0.0', async () => {
  const config = await loadRuntimeConfig(process.env);
  console.log(
    `[translate-proxy] listening on :${port} provider=${config.provider} model=${config.model_name} source=${config.source}`,
  );
});
