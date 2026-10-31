import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslationCache } from './translation-cache.mjs';
import { modelRequestOptions } from './model-request-options.mjs';
import { createModelClient } from './model-client.mjs';
import { sanitizeTranslatedText } from './translation-output.mjs';
import { installUpstreamAgent } from './upstream-agent.mjs';
import { glossaryStats, isInvariantChat } from './glossary.mjs';
import {
  PROMPT_REVISION,
  buildSystemPrompt,
  getTranslationContext,
  normalizeDirection,
  isIncomingDirection,
  normalizeGameScene,
  normalizeTranslationMode,
} from './translation-prompt.mjs';

import {
  loadRuntimeConfig,
  persistRuntimeConfig,
  resolveApiKey,
  summarizePublicSiteConfig,
  summarizeRuntimeConfig,
} from './runtime-config.mjs';
import {
  ingestAnalyticsEvents,
  queryTranslationDiagnostics,
  queryAnalyticsDaily,
  queryAnalyticsOverview,
  queryAnalyticsDistributions,
  recordTranslationServerDiagnostic,
} from './analytics-store.mjs';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lingo-operation-id, x-lingo-client-version, x-lingo-client-platform',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

const MAX_BODY_BYTES = 128 * 1024;
const FAST_LANE_CIRCUIT_BREAK_MS = 60_000;
const translationCache = createTranslationCache();
const { requestModel } = createModelClient();
installUpstreamAgent();
const translationInflight = new Map();
/// Hard cap on simultaneous in-flight translation requests. Beyond this
/// new requests return 503; a slow upstream can otherwise pin promises
/// at MAX_BODY_BYTES (128 KB) each.
const TRANSLATION_INFLIGHT_MAX = 512;
const fastLaneCircuit = new Map();
const ANALYTICS_PUBLIC_CACHE_TTL_MS = 30_000;
const ANALYTICS_PUBLIC_CACHE_MAX_ENTRIES = 64;
const analyticsPublicCache = new Map();

const ENV_PLACEHOLDER_VALUES = new Set([
  'replace-with-a-long-random-token',
  'replace-with-a-public-client-key',
]);

const isPlaceholderEnvValue = (value) => ENV_PLACEHOLDER_VALUES.has(String(value || '').trim());

const cachedAnalyticsResponse = (key, builder) => {
  const now = Date.now();
  const hit = analyticsPublicCache.get(key);
  if (hit && hit.expiresAt > now) {
    // LRU touch.
    analyticsPublicCache.delete(key);
    analyticsPublicCache.set(key, hit);
    return hit.value;
  }
  const value = builder();
  if (analyticsPublicCache.size >= ANALYTICS_PUBLIC_CACHE_MAX_ENTRIES) {
    // Map iteration is insertion-order, so the first key is the oldest.
    const oldest = analyticsPublicCache.keys().next().value;
    if (oldest !== undefined) {
      analyticsPublicCache.delete(oldest);
    }
  }
  analyticsPublicCache.set(key, { value, expiresAt: now + ANALYTICS_PUBLIC_CACHE_TTL_MS });
  return value;
};
const currentDir = dirname(fileURLToPath(import.meta.url));
const analyticsDashboardHtml = readFileSync(
  join(currentDir, '..', 'public', 'analytics-dashboard.html'),
  'utf8',
);

const jsonResponse = (res, status, payload) => {
  res.writeHead(status, corsHeaders);
  res.end(JSON.stringify(payload));
};

const htmlResponse = (res, status, html) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
};

const buildModelIdentity = (config) =>
  JSON.stringify({
    provider: config.provider,
    api_url: config.api_url,
    model_name: config.model_name,
    api_key_env_name: config.api_key_env_name,
  });

const sharesModelUpstream = (left, right) => buildModelIdentity(left) === buildModelIdentity(right);

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
    prompt_revision: PROMPT_REVISION,
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
    direction: normalizeDirection(payload?.direction),
    text,
  });

const normalizeComparableTranslation = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

const assertTranslationChanged = ({ result: rawResult, text, promptVariant }) => {
  const result = { ...rawResult, translatedText: sanitizeTranslatedText(rawResult?.translatedText) };
  if (
    promptVariant === 'translate' &&
    !isInvariantChat(text) &&
    normalizeComparableTranslation(result?.translatedText) === normalizeComparableTranslation(text)
  ) {
    const error = new Error('Model returned unchanged source text');
    error.status = 502;
    error.fromUpstream = true;
    error.attemptCount = Number(result?.attemptCount || 1);
    error.modelLatencyMs = Number(result?.modelLatencyMs || 0);
    throw error;
  }
  return result;
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

  const modelOptions = modelRequestOptions(config, effectiveMaxTokens, effectiveTemperature);
  return {
    promptVariant: isRewrite ? 'rewrite' : 'translate',
    systemPrompt: buildSystemPrompt(payload, text),
    effectiveMaxTokens: modelOptions.max_tokens,
    effectiveTemperature: modelOptions.temperature,
    styleProfile: styleProfile.id,
  };
};

const canUseFastLane = ({ config, payload, text, promptVariant }) => {
  const fastLane = config.fast_lane;
  if (!fastLane?.enabled || !fastLane.model_name) {
    return false;
  }

  // Incoming chat is high-volume and quality-sensitive only in the
  // "did the user understand it" sense. The fast lane (now also DeepSeek
  // V4-Flash by default) is the right home for it: short prompts, short
  // outputs, lower latency. We skip the style/profile checks that exist
  // to guard outgoing-translation quality, but still respect the
  // length cap — a freakishly long OCR line (>max_text_length) deserves
  // the primary lane's larger token budget so it doesn't get truncated.
  if (isIncomingDirection(payload)) {
    const textLength = Array.from(String(text || '').trim()).length;
    if (textLength > fastLane.max_text_length) {
      return false;
    }
    return getFastLaneCircuitExpiresAt(fastLane) === 0;
  }

  const { styleProfile } = getTranslationContext(payload);
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

const boundedHeader = (value, maxLength = 128) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const readTranslationClientContext = (req) => ({
  operationId: boundedHeader(req.headers['x-lingo-operation-id']),
  appVersion: boundedHeader(req.headers['x-lingo-client-version'], 64),
  platform: boundedHeader(req.headers['x-lingo-client-platform'], 64),
});

const persistTranslationServerDiagnostic = (value) => {
  if (!value?.operation_id) {
    return;
  }

  try {
    recordTranslationServerDiagnostic(value);
  } catch (error) {
    console.error(
      JSON.stringify({
        operation_id: value.operation_id,
        trace_id: value.trace_id,
        message: 'Failed to persist translation diagnostic',
        diagnostic_error: String(error?.message || error),
      }),
    );
  }
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

const shouldUseConfiguredFallback = (error) => {
  const status = Number(error?.status || 0);
  if ([400, 401, 403, 404, 405, 422].includes(status)) {
    return false;
  }
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return true;
  }
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 0 && (name.includes('abort') || message.includes('abort') || message.includes('fetch'));
};

const requestTranslatedText = async ({ cacheKey, load }) => {
  const cachedValue = translationCache.get(cacheKey);
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

  // Soft cap on in-flight distinct translation jobs. Coalescing already
  // handles the common case of many clients translating the same line;
  // this protects against many clients translating MANY different lines
  // while the upstream is hanging.
  if (translationInflight.size >= TRANSLATION_INFLIGHT_MAX) {
    const error = new Error('Translation service is over capacity, please retry shortly');
    error.status = 503;
    throw error;
  }

  const requestPromise = load().then((result) => {
    const { cacheable = true, ...cacheValue } = result;
    if (cacheable) {
      translationCache.set(cacheKey, cacheValue);
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
      public_site: summarizePublicSiteConfig(config),
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
    public_site: summarizePublicSiteConfig(nextConfig),
    api_key_env_name: nextConfig.api_key_env_name,
    timeout_ms: nextConfig.timeout_ms,
    max_tokens: nextConfig.max_tokens,
    temperature: nextConfig.temperature,
    trace_id: traceId,
  });
};

const routePublicSiteConfig = async (req, res, traceId) => {
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  const config = await loadRuntimeConfig(process.env);
  return jsonResponse(res, 200, {
    ...summarizePublicSiteConfig(config),
    trace_id: traceId,
  });
};

const routeTranslate = async (req, res, traceId, clientContext) => {
  const startedAt = Date.now();
  const config = await loadRuntimeConfig(process.env);

  if (req.method === 'GET') {
    return jsonResponse(res, 200, {
      ...summarizeRuntimeConfig(config),
      prompt_revision: PROMPT_REVISION,
      glossary: glossaryStats,
      trace_id: traceId,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  validateClientKey(req);

  if (!config.enabled) {
    persistTranslationServerDiagnostic({
      operation_id: clientContext.operationId,
      stage: 'server_response',
      status: 'failed',
      elapsed_ms: Date.now() - startedAt,
      error_code: 'service_disabled',
      error_message: 'Translation service is disabled',
      trace_id: traceId,
      http_status: 503,
      app_version: clientContext.appVersion,
      platform: clientContext.platform,
    });
    return jsonResponse(res, 503, {
      message: 'Translation service is disabled',
      trace_id: traceId,
      operation_id: clientContext.operationId,
    });
  }

  const payload = await readJsonBody(req);
  const text = String(payload?.text || '').trim();
  if (!text) {
    persistTranslationServerDiagnostic({
      operation_id: clientContext.operationId,
      stage: 'server_response',
      status: 'failed',
      elapsed_ms: Date.now() - startedAt,
      error_code: 'invalid_request',
      error_message: 'text is required',
      trace_id: traceId,
      http_status: 400,
      app_version: clientContext.appVersion,
      platform: clientContext.platform,
    });
    return jsonResponse(res, 400, {
      message: 'text is required',
      trace_id: traceId,
      operation_id: clientContext.operationId,
    });
  }

  const primaryTuning = resolveRequestTuning({ config, payload, text });
  if (!isIncomingDirection(payload) && isInvariantChat(text)) {
    // "gg", "wp", "BKB CD 20": conventional chat tokens are the same in every
    // language. Answer instantly instead of paying a model round-trip.
    const latencyMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        trace_id: traceId,
        operation_id: clientContext.operationId,
        client_version: clientContext.appVersion,
        client_platform: clientContext.platform,
        latency_ms: latencyMs,
        model_latency_ms: 0,
        proxy_overhead_ms: latencyMs,
        attempt_count: 0,
        response_source: 'invariant',
        model_route: 'none',
        prompt_variant: primaryTuning.promptVariant,
        text_length: text.length,
      }),
    );
    persistTranslationServerDiagnostic({
      operation_id: clientContext.operationId,
      stage: 'server_response',
      status: 'succeeded',
      elapsed_ms: latencyMs,
      text_length: text.length,
      translation_from: payload?.translation_from,
      translation_to: payload?.translation_to,
      translation_mode: payload?.translation_mode,
      game_scene: payload?.game_scene,
      daily_mode: payload?.daily_mode,
      trace_id: traceId,
      model: null,
      model_route: 'none',
      http_status: 200,
      app_version: clientContext.appVersion,
      platform: clientContext.platform,
    });
    return jsonResponse(res, 200, {
      translated_text: text,
      model: null,
      provider: null,
      config_source: config.source,
      latency_ms: latencyMs,
      model_latency_ms: 0,
      proxy_overhead_ms: latencyMs,
      attempt_count: 0,
      response_source: 'invariant',
      model_route: 'none',
      prompt_variant: primaryTuning.promptVariant,
      style_profile: primaryTuning.styleProfile,
      effective_max_tokens: 0,
      effective_temperature: 0,
      trace_id: traceId,
      operation_id: clientContext.operationId,
    });
  }
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
    hedged,
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
      const runFallbackModel = async ({ error, originConfig, modelRouteName }) => {
        let lastError = error;
        let attemptCount = Number(error?.attemptCount || 1);
        let modelLatencyMs = Number(error?.modelLatencyMs || 0);
        const attemptedConfigs = [originConfig];
        const fallbacks = [
          { routeConfig: config.fallback, routeName: modelRouteName },
          { routeConfig: config.secondary_fallback, routeName: `${modelRouteName}-secondary` },
        ];

        for (const { routeConfig: fallbackConfig, routeName } of fallbacks) {
          if (!shouldUseConfiguredFallback(lastError)) {
            break;
          }
          if (
            !fallbackConfig?.enabled ||
            attemptedConfigs.some((attempted) => sharesModelUpstream(attempted, fallbackConfig))
          ) {
            continue;
          }

          const fallbackApiKey = resolveApiKey(process.env, fallbackConfig);
          if (!fallbackApiKey) {
            console.error(
              JSON.stringify({
                trace_id: traceId,
                message: 'Fallback model is missing API key env',
                api_key_env_name: fallbackConfig.api_key_env_name,
              }),
            );
            continue;
          }

          const fallbackTuning = resolveRequestTuning({ config: fallbackConfig, payload, text });
          console.warn(
            JSON.stringify({
              trace_id: traceId,
              message: 'Preferred model failed, using configured fallback model',
              model_route: routeName,
              preferred_model: attemptedConfigs.at(-1).model_name,
              fallback_model: fallbackConfig.model_name,
              preferred_status: Number(lastError?.status || 0),
              preferred_error: String(lastError?.message || lastError),
            }),
          );
          attemptedConfigs.push(fallbackConfig);

          try {
            const fallbackResult = assertTranslationChanged({
              result: await requestModel({
                config: fallbackConfig,
                apiKey: fallbackApiKey,
                systemPrompt: fallbackTuning.systemPrompt,
                text,
                traceId,
                effectiveMaxTokens: fallbackTuning.effectiveMaxTokens,
                effectiveTemperature: fallbackTuning.effectiveTemperature,
                hedgeAfterMs: config.hedge_after_ms,
                maxTokensCeiling: fallbackConfig.max_tokens,
              }),
              text,
              promptVariant: fallbackTuning.promptVariant,
            });
            return {
              ...fallbackResult,
              attemptCount: attemptCount + fallbackResult.attemptCount,
              modelLatencyMs: modelLatencyMs + fallbackResult.modelLatencyMs,
              cacheable: false,
              modelRoute: routeName,
              modelName: fallbackConfig.model_name,
              modelProvider: fallbackConfig.provider,
              promptVariant: fallbackTuning.promptVariant,
              effectiveMaxTokens: fallbackTuning.effectiveMaxTokens,
              effectiveTemperature: fallbackTuning.effectiveTemperature,
              styleProfile: fallbackTuning.styleProfile,
            };
          } catch (fallbackError) {
            attemptCount += Number(fallbackError?.attemptCount || 1);
            modelLatencyMs += Number(fallbackError?.modelLatencyMs || 0);
            lastError = fallbackError;
          }
        }

        lastError.attemptCount = attemptCount;
        lastError.modelLatencyMs = modelLatencyMs;
        throw lastError;
      };

      const fallbackRouteSuffix = config.fallback?.model_name === 'deepseek-v4-pro'
        ? 'pro-fallback'
        : 'fallback';
      const runPrimaryModel = async (modelRouteName) => {
        const primaryApiKey = resolveApiKey(process.env, config);
        if (!primaryApiKey) {
          // Don't leak the env var name to clients. Log it server-side
          // so operators can diagnose, but mask it through the standard
          // upstream-error envelope so it surfaces as a generic
          // "Upstream service error" with status 502.
          console.error(
            JSON.stringify({
              trace_id: traceId,
              level: 'fatal',
              message: 'Missing API key env',
              api_key_env_name: config.api_key_env_name,
            }),
          );
          const error = new Error('Server is missing translation backend credentials');
          error.status = 502;
          error.fromUpstream = true;
          throw error;
        }

        let result;
        try {
          result = assertTranslationChanged({
            result: await requestModel({
              config,
              apiKey: primaryApiKey,
              systemPrompt: primaryTuning.systemPrompt,
              text,
              traceId,
              effectiveMaxTokens: primaryTuning.effectiveMaxTokens,
              effectiveTemperature: primaryTuning.effectiveTemperature,
              hedgeAfterMs: config.hedge_after_ms,
              maxTokensCeiling: config.max_tokens,
            }),
            text,
            promptVariant: primaryTuning.promptVariant,
          });
        } catch (error) {
          return runFallbackModel({
            error,
            originConfig: config,
            modelRouteName: `${modelRouteName}-${fallbackRouteSuffix}`,
          });
        }
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
        const fastLaneResult = assertTranslationChanged({
          result: await requestModel({
            config: selectedRouteConfig,
            apiKey: fastLaneApiKey,
            systemPrompt: selectedTuning.systemPrompt,
            text,
            traceId,
            effectiveMaxTokens: selectedTuning.effectiveMaxTokens,
            effectiveTemperature: selectedTuning.effectiveTemperature,
            hedgeAfterMs: config.hedge_after_ms,
            maxTokensCeiling: selectedRouteConfig.max_tokens,
          }),
          text,
          promptVariant: selectedTuning.promptVariant,
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
        if (sharesModelUpstream(config, selectedRouteConfig)) {
          console.warn(
            JSON.stringify({
              trace_id: traceId,
              message: 'Fast lane failed; skipped redundant fallback to the same upstream model',
              model_route: 'fast-lane',
              fast_model: selectedRouteConfig.model_name,
              fast_status: Number(error?.status || 0),
              fast_error: String(error?.message || error),
            }),
          );
          return runFallbackModel({
            error,
            originConfig: selectedRouteConfig,
            modelRouteName: `fast-${fallbackRouteSuffix}`,
          });
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
  const direction = normalizeDirection(payload?.direction);
  console.log(
    JSON.stringify({
      trace_id: traceId,
      operation_id: clientContext.operationId,
      client_version: clientContext.appVersion,
      client_platform: clientContext.platform,
      provider: modelProvider,
      model: modelName,
      config_source: config.source,
      latency_ms: latencyMs,
      model_latency_ms: modelLatencyMs,
      proxy_overhead_ms: proxyOverheadMs,
      attempt_count: attemptCount,
      hedged: Boolean(hedged),
      response_source: responseSource,
      model_route: modelRoute,
      prompt_variant: promptVariant,
      style_profile: styleProfile,
      effective_max_tokens: effectiveMaxTokens,
      effective_temperature: effectiveTemperature,
      text_length: text.length,
      direction,
    }),
  );

  persistTranslationServerDiagnostic({
    operation_id: clientContext.operationId,
    stage: 'server_response',
    status: 'succeeded',
    elapsed_ms: latencyMs,
    text_length: text.length,
    translation_from: payload?.translation_from,
    translation_to: payload?.translation_to,
    translation_mode: payload?.translation_mode,
    game_scene: payload?.game_scene,
    daily_mode: payload?.daily_mode,
    trace_id: traceId,
    model: modelName,
    model_route: modelRoute,
    http_status: 200,
    app_version: clientContext.appVersion,
    platform: clientContext.platform,
  });

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
    operation_id: clientContext.operationId,
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

const routeAnalyticsEvents = async (req, res, traceId) => {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  validateClientKey(req);
  const payload = await readJsonBody(req);
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const result = ingestAnalyticsEvents(events);

  return jsonResponse(res, 200, {
    ...result,
    trace_id: traceId,
  });
};

const routeAnalyticsPublicOverview = (res, traceId) => {
  const payload = cachedAnalyticsResponse('overview', queryAnalyticsOverview);
  return jsonResponse(res, 200, {
    ...payload,
    trace_id: traceId,
  });
};

const routeAnalyticsPublicDistributions = (res, traceId) => {
  const payload = cachedAnalyticsResponse('distributions', queryAnalyticsDistributions);
  return jsonResponse(res, 200, {
    ...payload,
    trace_id: traceId,
  });
};

const routeAnalyticsPublicDaily = (url, res, traceId) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const payload = cachedAnalyticsResponse(`daily:${from || ''}:${to || ''}`, () =>
    queryAnalyticsDaily({ from, to }),
  );

  return jsonResponse(res, 200, {
    ...payload,
    trace_id: traceId,
  });
};

const routeAdminTranslationDiagnostics = (req, res, url, traceId) => {
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { message: 'Method not allowed', trace_id: traceId });
  }

  requireAdminToken(req);
  const payload = queryTranslationDiagnostics({
    operationId: url.searchParams.get('operation_id'),
    traceId: url.searchParams.get('trace_id'),
    installationId: url.searchParams.get('installation_id'),
    status: url.searchParams.get('status'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    limit: url.searchParams.get('limit'),
  });
  return jsonResponse(res, 200, { ...payload, trace_id: traceId });
};

const server = createServer(async (req, res) => {
  const traceId = randomUUID();
  const requestStartedAt = Date.now();
  const clientContext = readTranslationClientContext(req);
  let requestPath = '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    requestPath = url.pathname;

    if (url.pathname === '/healthz') {
      await routeHealthz(res, traceId);
      return;
    }

    if (url.pathname === '/translate') {
      await routeTranslate(req, res, traceId, clientContext);
      return;
    }

    if (url.pathname === '/public/site-config') {
      await routePublicSiteConfig(req, res, traceId);
      return;
    }

    if (url.pathname === '/analytics/events') {
      await routeAnalyticsEvents(req, res, traceId);
      return;
    }

    if (url.pathname === '/analytics/public/overview') {
      routeAnalyticsPublicOverview(res, traceId);
      return;
    }

    if (url.pathname === '/analytics/public/daily') {
      routeAnalyticsPublicDaily(url, res, traceId);
      return;
    }

    if (url.pathname === '/analytics/public/distributions') {
      routeAnalyticsPublicDistributions(res, traceId);
      return;
    }

    if (url.pathname === '/analytics/dashboard') {
      const configuredAdmin = String(process.env.ADMIN_TOKEN || '').trim();
      if (!configuredAdmin || isPlaceholderEnvValue(configuredAdmin)) {
        jsonResponse(res, 503, {
          message: 'ADMIN_TOKEN is not configured',
          trace_id: traceId,
        });
        return;
      }
      const providedToken =
        readBearerToken(req.headers.authorization) || url.searchParams.get('token') || '';
      if (providedToken !== configuredAdmin) {
        jsonResponse(res, 401, {
          message: 'Unauthorized',
          trace_id: traceId,
        });
        return;
      }
      htmlResponse(res, 200, analyticsDashboardHtml);
      return;
    }

    if (url.pathname === '/admin/runtime-config') {
      await routeAdminRuntimeConfig(req, res, traceId);
      return;
    }

    if (url.pathname === '/admin/translation-diagnostics') {
      routeAdminTranslationDiagnostics(req, res, url, traceId);
      return;
    }

    jsonResponse(res, 404, {
      message: 'Not found',
      trace_id: traceId,
    });
  } catch (error) {
    const rawStatus = Number.isInteger(error?.status) ? Number(error.status) : 500;
    const status = Math.min(599, Math.max(400, rawStatus));
    const isTimeout = error?.name === 'AbortError';
    const internalMessage = isTimeout
      ? 'Model request timed out'
      : error?.message || 'Internal error';
    const clientMessage = error?.fromUpstream
      ? `Upstream service error (HTTP ${status})`
      : internalMessage;

    console.error(
      JSON.stringify({
        trace_id: traceId,
        operation_id: clientContext.operationId,
        client_version: clientContext.appVersion,
        client_platform: clientContext.platform,
        status,
        message: internalMessage,
        from_upstream: Boolean(error?.fromUpstream),
      }),
    );

    if (requestPath === '/translate') {
      persistTranslationServerDiagnostic({
        operation_id: clientContext.operationId,
        stage: 'server_response',
        status: 'failed',
        elapsed_ms: Date.now() - requestStartedAt,
        error_code: error?.fromUpstream ? 'upstream_error' : isTimeout ? 'timeout' : 'server_error',
        error_message: internalMessage,
        trace_id: traceId,
        http_status: isTimeout ? 504 : status,
        app_version: clientContext.appVersion,
        platform: clientContext.platform,
      });
    }

    jsonResponse(res, isTimeout ? 504 : status, {
      message: clientMessage,
      trace_id: traceId,
      operation_id: clientContext.operationId,
    });
  }
});

const parsedPort = Number.parseInt(process.env.PORT || '8787', 10);
if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
  console.error(`[translate-proxy] invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}
const port = parsedPort;
const host = String(process.env.HOST || '0.0.0.0').trim();
if (!host) {
  console.error('[translate-proxy] invalid empty HOST value');
  process.exit(1);
}

const warnAboutCredentialsAtStartup = () => {
  const backendKey = String(process.env.BACKEND_PUBLIC_KEY || '').trim();
  if (!backendKey) {
    console.warn(
      '[translate-proxy] WARNING: BACKEND_PUBLIC_KEY is not set — /translate and /analytics/events accept any caller. Set BACKEND_PUBLIC_KEY in your environment for production.',
    );
  } else if (isPlaceholderEnvValue(backendKey)) {
    console.warn(
      '[translate-proxy] WARNING: BACKEND_PUBLIC_KEY still uses the .env.example placeholder. Replace it with a real secret before deploying.',
    );
  }

  const adminToken = String(process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken) {
    console.warn(
      '[translate-proxy] WARNING: ADMIN_TOKEN is not set — /admin/* and /analytics/dashboard will respond 503.',
    );
  } else if (isPlaceholderEnvValue(adminToken)) {
    console.warn(
      '[translate-proxy] WARNING: ADMIN_TOKEN still uses the .env.example placeholder. Replace it with a real secret before deploying.',
    );
  }
};

// Last-resort process-level handlers. Node 20+ defaults to
// `--unhandled-rejections=throw`, which surfaces these as a crash; we
// want to at least log structured JSON before exiting so operators can
// see what happened in `kubectl logs` / `journalctl` after the fact.
process.on('unhandledRejection', (reason) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      kind: 'unhandledRejection',
      message: String(reason && reason.message ? reason.message : reason),
    }),
  );
});
process.on('uncaughtException', (error) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      kind: 'uncaughtException',
      message: String(error?.message || error),
    }),
  );
  // Defer to default behaviour (terminate) — the catch is purely for the
  // structured-log breadcrumb.
  process.exitCode = 1;
});

server.listen(port, host, async () => {
  warnAboutCredentialsAtStartup();
  const config = await loadRuntimeConfig(process.env);
  console.log(
    `[translate-proxy] listening on ${host}:${port} provider=${config.provider} model=${config.model_name} source=${config.source}`,
  );
});
