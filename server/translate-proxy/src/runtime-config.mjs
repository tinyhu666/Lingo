import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENAI_PATH = '/v1/chat/completions';
const ANTHROPIC_PATH = '/v1/messages';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 140;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MODEL_NAME = 'deepseek-ai/DeepSeek-V3';
const DEFAULT_API_KEY_ENV_NAME = 'MODEL_API_KEY';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const defaultApiUrl = (provider) =>
  provider === 'anthropic'
    ? 'https://api.anthropic.com/v1/messages'
    : 'https://api.siliconflow.cn/v1/chat/completions';

export const toProvider = (value) => {
  const normalized = String(value || 'openai-compatible').trim().toLowerCase();
  if (normalized === 'anthropic') {
    return 'anthropic';
  }
  if (normalized === 'openai') {
    return 'openai';
  }
  return 'openai-compatible';
};

const normalizeOpenAICompletionsUrl = (apiUrl) => {
  const trimmed = String(apiUrl || defaultApiUrl('openai-compatible')).trim().replace(/\/+$/, '');
  if (trimmed.endsWith(OPENAI_PATH) || trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}${OPENAI_PATH}`;
};

export const normalizeApiUrlByProvider = (apiUrl, provider) => {
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

const clampNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const defaultRuntimeConfigPath = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'runtime-config.json');

export const runtimeConfigPathFromEnv = (env) =>
  path.resolve(env.RUNTIME_CONFIG_PATH || defaultRuntimeConfigPath());

export const sanitizeRuntimeConfig = (candidate, source = 'environment', updatedAt = null) => {
  const record = isRecord(candidate) ? candidate : {};
  const provider = toProvider(record.provider);

  return {
    enabled: record.enabled !== false,
    provider,
    api_url: normalizeApiUrlByProvider(record.api_url, provider),
    model_name: String(record.model_name || DEFAULT_MODEL_NAME).trim() || DEFAULT_MODEL_NAME,
    api_key_env_name:
      String(record.api_key_env_name || DEFAULT_API_KEY_ENV_NAME).trim() || DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: clampNumber(record.timeout_ms, DEFAULT_TIMEOUT_MS, 3_000, 120_000),
    max_tokens: clampNumber(record.max_tokens, DEFAULT_MAX_TOKENS, 1, 4_096),
    temperature: clampNumber(record.temperature, DEFAULT_TEMPERATURE, 0, 2),
    source,
    updated_at: updatedAt,
  };
};

export const environmentRuntimeConfig = (env) =>
  sanitizeRuntimeConfig(
    {
      enabled: env.MODEL_ENABLED !== 'false',
      provider: env.MODEL_PROVIDER || 'openai-compatible',
      api_url: env.MODEL_API_URL || defaultApiUrl('openai-compatible'),
      model_name: env.MODEL_NAME || DEFAULT_MODEL_NAME,
      api_key_env_name: env.MODEL_API_KEY_ENV_NAME || DEFAULT_API_KEY_ENV_NAME,
      timeout_ms: env.MODEL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
      max_tokens: env.MODEL_MAX_TOKENS || DEFAULT_MAX_TOKENS,
      temperature: env.MODEL_TEMPERATURE || DEFAULT_TEMPERATURE,
    },
    'environment',
  );

export const loadRuntimeConfig = async (env = process.env) => {
  const configPath = runtimeConfigPathFromEnv(env);

  try {
    const [raw, metadata] = await Promise.all([readFile(configPath, 'utf8'), stat(configPath)]);
    const updatedAt = metadata.mtime.toISOString();
    return sanitizeRuntimeConfig(JSON.parse(raw), 'file', updatedAt);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.name === 'SyntaxError')) {
      if (error.name === 'SyntaxError') {
        console.error('[translate-proxy] Invalid runtime config JSON, falling back to environment.');
      }
      return environmentRuntimeConfig(env);
    }
    throw error;
  }
};

const toPersistedRuntimeConfig = (config) => ({
  enabled: config.enabled !== false,
  provider: toProvider(config.provider),
  api_url: String(config.api_url || ''),
  model_name: String(config.model_name || DEFAULT_MODEL_NAME),
  api_key_env_name: String(config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME),
  timeout_ms: Number(config.timeout_ms || DEFAULT_TIMEOUT_MS),
  max_tokens: Number(config.max_tokens || DEFAULT_MAX_TOKENS),
  temperature: Number(config.temperature || DEFAULT_TEMPERATURE),
});

export const persistRuntimeConfig = async (env, config) => {
  const configPath = runtimeConfigPathFromEnv(env);
  const normalized = sanitizeRuntimeConfig(config, 'file', new Date().toISOString());
  const serialized = JSON.stringify(toPersistedRuntimeConfig(normalized), null, 2);

  await mkdir(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, `${serialized}\n`, 'utf8');
  await rename(tempPath, configPath);

  return loadRuntimeConfig(env);
};

export const resolveApiKey = (env, config) => {
  const keyName = String(config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME).trim();
  return String(env[keyName] || '').trim();
};

export const summarizeRuntimeConfig = (config) => ({
  enabled: config.enabled,
  provider: config.provider,
  model: config.model_name,
  api_url: config.api_url,
  config_source: config.source,
  updated_at: config.updated_at,
});
