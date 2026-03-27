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
const TRANSLATION_CACHE_TTL_MS = 15_000;
const TRANSLATION_CACHE_MAX_ENTRIES = 256;
const FAST_LANE_CIRCUIT_BREAK_MS = 60_000;
const LANGUAGE_LABELS = {
  zh: 'Chinese',
  en: 'English',
  'en-SEA': 'Southeast Asian English',
  ko: 'Korean',
  fr: 'French',
  ru: 'Russian',
  es: 'Spanish',
  ja: 'Japanese',
  de: 'German',
  auto: 'the detected source language',
};
const DEFAULT_GAME_SCENE = 'dota2';
const DEFAULT_TRANSLATION_MODE = 'auto';
const GAME_SCENE_PROFILES = {
  dota2: {
    id: 'dota2',
    label: 'Dota 2',
    promptInstruction:
      'Prefer Dota 2 terms such as hero, lane, rune, buyback, Roshan, BKB, smoke, and high ground when they fit naturally.',
  },
  lol: {
    id: 'lol',
    label: 'League of Legends',
    promptInstruction:
      'Prefer League of Legends terms such as champion, lane, jungle, dragon, baron, flash, TP, and objective when they fit naturally.',
  },
  wow: {
    id: 'wow',
    label: 'World of Warcraft',
    promptInstruction:
      'Prefer World of Warcraft terms such as dungeon, raid, healer, tank, aggro, pull, cooldown, and wipe when they fit naturally.',
  },
  overwatch: {
    id: 'overwatch',
    label: 'Overwatch',
    promptInstruction:
      'Prefer Overwatch terms such as hero, ult, payload, point, flank, support, dive, and stagger when they fit naturally.',
  },
  other: {
    id: 'other',
    label: 'Other Game',
    promptInstruction:
      'Keep the wording generic for multiplayer game chat. Do not force Dota 2, League of Legends, World of Warcraft, or Overwatch terminology.',
  },
};
const STYLE_PROFILES = {
  auto: {
    id: 'auto',
    fastLaneEligible: true,
    translateTemperatureCap: 0.12,
    rewriteTemperatureCap: 0.16,
    translateTokenAdjustment: 0,
    rewriteTokenAdjustment: 0,
    translateInstruction:
      'Sound natural, steady, and clear like a normal teammate speaking plainly. Keep meaning intact and avoid overacting.',
    rewriteInstruction:
      'Rewrite into natural, steady, send-ready in-game chat. Keep the meaning intact and avoid sounding theatrical.',
  },
  pro: {
    id: 'pro',
    fastLaneEligible: true,
    translateTemperatureCap: 0.05,
    rewriteTemperatureCap: 0.08,
    translateTokenAdjustment: -8,
    rewriteTokenAdjustment: -8,
    translateInstruction:
      'Prefer tighter tactical wording, shorter commands, stronger tempo words, and common in-game shorthand when natural.',
    rewriteInstruction:
      'Compress the line into sharper teamplay comms. Cut filler, keep tactical intent obvious, and favor crisp call-style wording.',
  },
  toxic: {
    id: 'toxic',
    fastLaneEligible: false,
    translateTemperatureCap: 0.18,
    rewriteTemperatureCap: 0.22,
    translateTokenAdjustment: 10,
    rewriteTokenAdjustment: 8,
    translateInstruction:
      'Make it sharper, more confrontational, and more pressuring like in-game trash talk, but avoid hate speech, slurs, threats, or extreme abuse.',
    rewriteInstruction:
      'Rewrite with more taunting, pressure, and swagger for in-game trash talk, but keep it usable in chat and avoid hate speech, slurs, threats, or extreme abuse.',
  },
};
const translationCache = new Map();
const translationInflight = new Map();
const fastLaneCircuit = new Map();

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

const evictExpiredTranslationCache = (now = Date.now()) => {
  for (const [cacheKey, entry] of translationCache.entries()) {
    if (entry.expiresAt <= now) {
      translationCache.delete(cacheKey);
    }
  }
};

const getCachedTranslation = (cacheKey) => {
  evictExpiredTranslationCache();
  const entry = translationCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  translationCache.delete(cacheKey);
  translationCache.set(cacheKey, entry);
  return entry.value;
};

const setCachedTranslation = (cacheKey, value) => {
  evictExpiredTranslationCache();
  if (translationCache.size >= TRANSLATION_CACHE_MAX_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey) {
      translationCache.delete(oldestKey);
    }
  }

  translationCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS,
  });
};

const buildModelIdentity = (config) =>
  JSON.stringify({
    provider: config.provider,
    api_url: config.api_url,
    model_name: config.model_name,
    api_key_env_name: config.api_key_env_name,
  });

const getFastLaneCircuitExpiresAt = (fastLaneConfig) => {
  const identity = buildModelIdentity(fastLaneConfig);
  const expiresAt = fastLaneCircuit.get(identity) || 0;
  if (expiresAt <= Date.now()) {
    fastLaneCircuit.delete(identity);
    return 0;
  }
  return expiresAt;
};

const openFastLaneCircuit = (fastLaneConfig) => {
  fastLaneCircuit.set(buildModelIdentity(fastLaneConfig), Date.now() + FAST_LANE_CIRCUIT_BREAK_MS);
};

const shouldOpenFastLaneCircuit = (error) => {
  const status = Number(error?.status || 0);
  return [400, 401, 403, 404, 405, 422].includes(status);
};

const buildTranslationCacheKey = ({ routeConfig, routeName, tuning, payload, text }) =>
  JSON.stringify({
    route_name: routeName,
    provider: routeConfig.provider,
    api_url: routeConfig.api_url,
    model: routeConfig.model_name,
    temperature: tuning.effectiveTemperature,
    max_tokens: tuning.effectiveMaxTokens,
    translation_from: String(payload?.translation_from || 'auto').trim() || 'auto',
    translation_to: String(payload?.translation_to || 'en').trim() || 'en',
    translation_mode: normalizeTranslationMode(payload?.translation_mode),
    game_scene: normalizeGameScene(payload?.game_scene),
    daily_mode: Boolean(payload?.daily_mode),
    text,
  });

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

const describeLanguage = (value, fallback = 'the requested language') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }
  return LANGUAGE_LABELS[normalized] || normalized;
};

const normalizeTranslationMode = (value) => {
  const normalized = String(value || DEFAULT_TRANSLATION_MODE).trim().toLowerCase();
  return STYLE_PROFILES[normalized]?.id || DEFAULT_TRANSLATION_MODE;
};

const normalizeGameScene = (value) => {
  const normalized = String(value || DEFAULT_GAME_SCENE).trim().toLowerCase();
  if (GAME_SCENE_PROFILES[normalized]) {
    return normalized;
  }
  if (['general', 'moba', 'fps', 'mmo', ''].includes(normalized)) {
    return DEFAULT_GAME_SCENE;
  }
  return DEFAULT_GAME_SCENE;
};

const getTranslationContext = (payload) => {
  const translationFrom = String(payload?.translation_from || 'auto').trim() || 'auto';
  const translationTo = String(payload?.translation_to || 'en').trim() || 'en';
  const translationMode = normalizeTranslationMode(payload?.translation_mode);
  const gameScene = normalizeGameScene(payload?.game_scene);
  return {
    translationFrom,
    translationTo,
    translationMode,
    gameScene,
    isRewrite: translationFrom === translationTo,
    styleProfile: STYLE_PROFILES[translationMode],
    gameSceneProfile: GAME_SCENE_PROFILES[gameScene],
  };
};

const buildSystemPrompt = (payload) => {
  const {
    translationFrom,
    translationTo,
    translationMode,
    isRewrite,
    styleProfile,
    gameSceneProfile,
  } = getTranslationContext(payload);
  const dailyMode = Boolean(payload?.daily_mode);
  const sourceLabel = describeLanguage(translationFrom, 'the detected source language');
  const targetLabel = describeLanguage(translationTo, 'the requested language');
  const styleInstruction = isRewrite
    ? styleProfile.rewriteInstruction
    : styleProfile.translateInstruction;
  const dailyInstruction = dailyMode
    ? 'Daily mode:on. Keep it conversational and send-ready.'
    : 'Daily mode:off. Keep it concise and paced for in-game chat.';

  if (isRewrite) {
    return [
      `Rewrite in-game chat in ${targetLabel}.`,
      `Style:${translationMode}. ${styleInstruction}`,
      `Game:${gameSceneProfile.label}. ${gameSceneProfile.promptInstruction}`,
      dailyInstruction,
      'Keep the meaning intact. Output one concise send-ready line only. No notes or quotes.',
    ].join(' ');
  }

  return [
    `Translate in-game chat from ${sourceLabel} to ${targetLabel}.`,
    `Style:${translationMode}. ${styleInstruction}`,
    `Game:${gameSceneProfile.label}. ${gameSceneProfile.promptInstruction}`,
    dailyInstruction,
    'Output one concise send-ready line only. Prefer established in-game terms when they help. No notes or quotes.',
  ].join(' ');
};

const resolveRequestTuning = ({ config, payload, text }) => {
  const { isRewrite, styleProfile } = getTranslationContext(payload);
  const textLength = Array.from(String(text || '').trim()).length;
  const configuredMaxTokens = Number(config.max_tokens) || 96;
  let budgetCap = configuredMaxTokens;

  if (textLength <= 18) {
    budgetCap = isRewrite ? 24 : 30;
  } else if (textLength <= 48) {
    budgetCap = isRewrite ? 32 : 40;
  } else if (textLength <= 96) {
    budgetCap = isRewrite ? 44 : 56;
  } else if (textLength <= 160) {
    budgetCap = isRewrite ? 56 : 72;
  } else {
    budgetCap = isRewrite ? 72 : 88;
  }

  const styleTokenAdjustment = isRewrite
    ? styleProfile.rewriteTokenAdjustment
    : styleProfile.translateTokenAdjustment;
  const minimumBudget = isRewrite ? 20 : 24;
  const effectiveMaxTokens = Math.min(
    configuredMaxTokens,
    Math.max(minimumBudget, budgetCap + styleTokenAdjustment),
  );

  const configuredTemperature = Number(config.temperature);
  const temperatureCap = isRewrite
    ? styleProfile.rewriteTemperatureCap
    : styleProfile.translateTemperatureCap;
  const effectiveTemperature = Number.isFinite(configuredTemperature)
    ? Math.min(configuredTemperature, temperatureCap)
    : temperatureCap;

  return {
    promptVariant: isRewrite ? 'rewrite' : 'translate',
    systemPrompt: buildSystemPrompt(payload),
    effectiveMaxTokens,
    effectiveTemperature,
    styleProfile: styleProfile.id,
  };
};

const canUseFastLane = ({ config, payload, text, promptVariant }) => {
  const fastLane = config.fast_lane;
  if (!fastLane?.enabled || !fastLane.model_name) {
    return false;
  }

  const styleProfile = STYLE_PROFILES[normalizeTranslationMode(payload?.translation_mode)];
  if (!styleProfile.fastLaneEligible) {
    return false;
  }

  if (!fastLane.allowed_prompt_variants.includes(promptVariant)) {
    return false;
  }

  const textLength = Array.from(String(text || '').trim()).length;
  if (textLength > fastLane.max_text_length) {
    return false;
  }

  return getFastLaneCircuitExpiresAt(fastLane) === 0;
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

const requestModelOnce = async ({
  config,
  apiKey,
  systemPrompt,
  text,
  traceId,
  effectiveMaxTokens,
  effectiveTemperature,
}) => {
  const startedAt = Date.now();
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
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
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
        console.warn(
          JSON.stringify({
            trace_id: traceId,
            provider: config.provider,
            model: config.model_name,
            message: 'Anthropic returned empty content',
            raw_summary: summarizeText(raw),
          }),
        );
        const error = new Error('Empty model response');
        error.status = 502;
        throw error;
      }

      return {
        translatedText,
        modelLatencyMs: Date.now() - startedAt,
      };
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
        temperature: effectiveTemperature,
        max_tokens: effectiveMaxTokens,
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
      console.warn(
        JSON.stringify({
          trace_id: traceId,
          provider: config.provider,
          model: config.model_name,
          message: 'OpenAI-compatible provider returned empty content',
          raw_summary: summarizeText(raw),
        }),
      );
      const error = new Error('Empty model response');
      error.status = 502;
      throw error;
    }

    return {
      translatedText,
      modelLatencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
};

const shouldRetryModelRequest = (error) => String(error?.message || '').includes('Empty model response');

const requestModel = async ({
  config,
  apiKey,
  systemPrompt,
  text,
  traceId,
  effectiveMaxTokens,
  effectiveTemperature,
}) => {
  const startedAt = Date.now();
  try {
    const result = await requestModelOnce({
      config,
      apiKey,
      systemPrompt,
      text,
      traceId,
      effectiveMaxTokens,
      effectiveTemperature,
    });
    return {
      ...result,
      attemptCount: 1,
      modelLatencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (!shouldRetryModelRequest(error)) {
      throw error;
    }

    console.warn(
      JSON.stringify({
        trace_id: traceId,
        provider: config.provider,
        model: config.model_name,
        message: 'Retrying translation after empty model response',
      }),
    );

    const retryResult = await requestModelOnce({
      config,
      apiKey,
      text,
      traceId,
      effectiveMaxTokens,
      effectiveTemperature,
      systemPrompt: `${systemPrompt} Never return an empty response.`,
    });
    return {
      ...retryResult,
      attemptCount: 2,
      modelLatencyMs: Date.now() - startedAt,
    };
  }
};

const requestTranslatedText = async ({ cacheKey, load }) => {
  const cachedValue = getCachedTranslation(cacheKey);
  if (cachedValue) {
    return {
      ...cachedValue,
      responseSource: 'memory-cache',
      attemptCount: 0,
      modelLatencyMs: 0,
    };
  }

  const inflightRequest = translationInflight.get(cacheKey);
  if (inflightRequest) {
    const sharedResult = await inflightRequest;
    return {
      ...sharedResult,
      responseSource: 'shared-inflight',
      attemptCount: 0,
      modelLatencyMs: 0,
    };
  }

  const requestPromise = load().then((result) => {
    const { cacheable = true, ...cacheValue } = result;
    if (cacheable) {
      setCachedTranslation(cacheKey, cacheValue);
    }
    return cacheValue;
  });
  translationInflight.set(cacheKey, requestPromise);

  try {
    const modelResult = await requestPromise;
    return {
      ...modelResult,
      responseSource: 'model',
    };
  } finally {
    translationInflight.delete(cacheKey);
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

  const primaryTuning = resolveRequestTuning({ config, payload, text });
  const useFastLane = canUseFastLane({
    config,
    payload,
    text,
    promptVariant: primaryTuning.promptVariant,
  });
  const selectedRouteName = useFastLane ? 'fast-lane' : 'primary';
  const selectedRouteConfig = useFastLane ? config.fast_lane : config;
  const selectedTuning = useFastLane
    ? resolveRequestTuning({ config: selectedRouteConfig, payload, text })
    : primaryTuning;
  const cacheKey = buildTranslationCacheKey({
    routeConfig: selectedRouteConfig,
    routeName: selectedRouteName,
    tuning: selectedTuning,
    payload,
    text,
  });
  const {
    translatedText,
    responseSource,
    attemptCount,
    modelLatencyMs,
    modelRoute,
    modelName,
    modelProvider,
    promptVariant,
    effectiveMaxTokens,
    effectiveTemperature,
    styleProfile,
  } = await requestTranslatedText({
    cacheKey,
    load: async () => {
      const runPrimaryModel = async (modelRouteName) => {
        const primaryApiKey = resolveApiKey(process.env, config);
        if (!primaryApiKey) {
          const error = new Error(`Missing API key env: ${config.api_key_env_name}`);
          error.status = 500;
          throw error;
        }

        const result = await requestModel({
          config,
          apiKey: primaryApiKey,
          systemPrompt: primaryTuning.systemPrompt,
          text,
          traceId,
          effectiveMaxTokens: primaryTuning.effectiveMaxTokens,
          effectiveTemperature: primaryTuning.effectiveTemperature,
        });
        return {
          ...result,
          cacheable: modelRouteName === 'primary',
          modelRoute: modelRouteName,
          modelName: config.model_name,
          modelProvider: config.provider,
          promptVariant: primaryTuning.promptVariant,
          effectiveMaxTokens: primaryTuning.effectiveMaxTokens,
          effectiveTemperature: primaryTuning.effectiveTemperature,
          styleProfile: primaryTuning.styleProfile,
        };
      };

      if (!useFastLane) {
        return runPrimaryModel('primary');
      }

      const fastLaneApiKey = resolveApiKey(process.env, selectedRouteConfig);
      if (!fastLaneApiKey) {
        openFastLaneCircuit(selectedRouteConfig);
        console.warn(
          JSON.stringify({
            trace_id: traceId,
            message: 'Fast lane missing API key, falling back to primary model',
            model_route: 'fast-fallback',
            fast_model: selectedRouteConfig.model_name,
          }),
        );
        return runPrimaryModel('fast-fallback');
      }

      try {
        const fastLaneResult = await requestModel({
          config: selectedRouteConfig,
          apiKey: fastLaneApiKey,
          systemPrompt: selectedTuning.systemPrompt,
          text,
          traceId,
          effectiveMaxTokens: selectedTuning.effectiveMaxTokens,
          effectiveTemperature: selectedTuning.effectiveTemperature,
        });
        return {
          ...fastLaneResult,
          modelRoute: 'fast-lane',
          modelName: selectedRouteConfig.model_name,
          modelProvider: selectedRouteConfig.provider,
          promptVariant: selectedTuning.promptVariant,
          effectiveMaxTokens: selectedTuning.effectiveMaxTokens,
          effectiveTemperature: selectedTuning.effectiveTemperature,
          styleProfile: selectedTuning.styleProfile,
        };
      } catch (error) {
        if (shouldOpenFastLaneCircuit(error)) {
          openFastLaneCircuit(selectedRouteConfig);
        }
        console.warn(
          JSON.stringify({
            trace_id: traceId,
            message: 'Fast lane failed, falling back to primary model',
            model_route: 'fast-fallback',
            fast_model: selectedRouteConfig.model_name,
            fast_status: Number(error?.status || 0),
            fast_error: String(error?.message || error),
          }),
        );
        return runPrimaryModel('fast-fallback');
      }
    },
  });

  const latencyMs = Date.now() - startedAt;
  const proxyOverheadMs = Math.max(0, latencyMs - modelLatencyMs);
  console.log(
    JSON.stringify({
      trace_id: traceId,
      provider: modelProvider,
      model: modelName,
      config_source: config.source,
      latency_ms: latencyMs,
      model_latency_ms: modelLatencyMs,
      proxy_overhead_ms: proxyOverheadMs,
      attempt_count: attemptCount,
      response_source: responseSource,
      model_route: modelRoute,
      prompt_variant: promptVariant,
      style_profile: styleProfile,
      effective_max_tokens: effectiveMaxTokens,
      effective_temperature: effectiveTemperature,
      text_length: text.length,
    }),
  );

  return jsonResponse(res, 200, {
    translated_text: translatedText,
    model: modelName,
    provider: modelProvider,
    config_source: config.source,
    latency_ms: latencyMs,
    model_latency_ms: modelLatencyMs,
    proxy_overhead_ms: proxyOverheadMs,
    attempt_count: attemptCount,
    response_source: responseSource,
    model_route: modelRoute,
    prompt_variant: promptVariant,
    style_profile: styleProfile,
    effective_max_tokens: effectiveMaxTokens,
    effective_temperature: effectiveTemperature,
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
    config_source: config.source,
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
