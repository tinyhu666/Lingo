import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENAI_PATH = '/v1/chat/completions';
const ANTHROPIC_PATH = '/v1/messages';
const CONFIG_CACHE_TTL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_TOKENS = 96;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MODEL_NAME = 'deepseek-ai/DeepSeek-V3.2';
const DEFAULT_API_KEY_ENV_NAME = 'MODEL_API_KEY';
const DEFAULT_FAST_LANE_MODEL_NAME = 'Qwen/Qwen3-14B';
const DEFAULT_FAST_LANE_TIMEOUT_MS = 5_000;
const DEFAULT_FAST_LANE_MAX_TOKENS = 48;
const DEFAULT_FAST_LANE_TEMPERATURE = 0.1;
const DEFAULT_FAST_LANE_MAX_TEXT_LENGTH = 72;
const DEFAULT_FAST_LANE_ALLOWED_PROMPT_VARIANTS = ['translate', 'rewrite'];
const DEFAULT_VISION_MODEL_NAME = '';
const DEFAULT_VISION_TIMEOUT_MS = 8_000;
const DEFAULT_INCOMING_CHAT_CAPTURE_INTERVAL_MS = 250;
const DEFAULT_INCOMING_CHAT_STABLE_DEBOUNCE_MS = 360;
const DEFAULT_INCOMING_CHAT_FRAME_DIFF_THRESHOLD = 0.012;
const DEFAULT_INCOMING_CHAT_DEDUPE_WINDOW_MS = 8_000;
const DEFAULT_INCOMING_CHAT_OVERLAY_DURATION_MS = 6_000;
const DEFAULT_INCOMING_CHAT_DEFAULT_MODE = 'auto';
const DEFAULT_GENERIC_CHAT_ROI = Object.freeze({
  x: 0.04,
  y: 0.64,
  width: 0.34,
  height: 0.18,
});
const DEFAULT_DOTA2_CHAT_ROI = Object.freeze({
  x: 0.294,
  y: 0.612,
  width: 0.422,
  height: 0.168,
});
const DEFAULT_INCOMING_CHAT_GAME_PROFILES = Object.freeze({
  dota2: {
    default_roi: DEFAULT_DOTA2_CHAT_ROI,
    auto_detect_enabled: true,
    vision_prompt_version: 'dota2-chat-v1',
    window_title_keywords: ['dota 2'],
  },
  lol: {
    default_roi: DEFAULT_GENERIC_CHAT_ROI,
    auto_detect_enabled: false,
    vision_prompt_version: 'lol-chat-v1',
    window_title_keywords: ['league of legends'],
  },
  wow: {
    default_roi: DEFAULT_GENERIC_CHAT_ROI,
    auto_detect_enabled: false,
    vision_prompt_version: 'wow-chat-v1',
    window_title_keywords: ['world of warcraft', 'wow'],
  },
  overwatch: {
    default_roi: DEFAULT_GENERIC_CHAT_ROI,
    auto_detect_enabled: false,
    vision_prompt_version: 'overwatch-chat-v1',
    window_title_keywords: ['overwatch'],
  },
  other: {
    default_roi: DEFAULT_GENERIC_CHAT_ROI,
    auto_detect_enabled: false,
    vision_prompt_version: 'generic-chat-v1',
    window_title_keywords: [],
  },
});
const DEFAULT_CONTACT_DISCORD_URL = 'https://discord.gg/cWB49jCfdP';
const DEFAULT_CONTACT_EMAIL = 'huruiw@outlook.com';
const DEFAULT_CONTACT_QQ_GROUP = '1095706752';

let runtimeConfigCache = null;

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

const normalizeString = (value) => String(value || '').trim();

const withDefaultWhenMissing = (value, fallback) =>
  value === undefined || value === null ? fallback : normalizeString(value);

const normalizePromptVariants = (value) => {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : DEFAULT_FAST_LANE_ALLOWED_PROMPT_VARIANTS;
  const normalized = [...new Set(
    candidates
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => item === 'translate' || item === 'rewrite'),
  )];
  return normalized.length > 0 ? normalized : [...DEFAULT_FAST_LANE_ALLOWED_PROMPT_VARIANTS];
};

const normalizeIncomingChatMode = (value) =>
  String(value || DEFAULT_INCOMING_CHAT_DEFAULT_MODE).trim().toLowerCase() === 'manual'
    ? 'manual'
    : 'auto';

const sanitizeStringList = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = [...new Set(
    source
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  )];
  return normalized;
};

const clampUnitInterval = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, parsed));
};

const sanitizeRoi = (candidate, fallback) => {
  const source = isRecord(candidate) ? candidate : {};
  return {
    x: clampUnitInterval(source.x, fallback.x),
    y: clampUnitInterval(source.y, fallback.y),
    width: clampUnitInterval(source.width, fallback.width),
    height: clampUnitInterval(source.height, fallback.height),
  };
};

const sanitizeIncomingChatGameProfile = (candidate, fallback) => {
  const record = isRecord(candidate) ? candidate : {};
  return {
    default_roi: sanitizeRoi(record.default_roi, fallback.default_roi),
    auto_detect_enabled:
      record.auto_detect_enabled === undefined
        ? fallback.auto_detect_enabled !== false
        : record.auto_detect_enabled !== false,
    vision_prompt_version:
      normalizeString(record.vision_prompt_version) || fallback.vision_prompt_version,
    window_title_keywords: sanitizeStringList(
      record.window_title_keywords,
      fallback.window_title_keywords,
    ),
  };
};

const sanitizeIncomingChatConfig = (candidate) => {
  const record = isRecord(candidate) ? candidate : {};
  const games = isRecord(record.games) ? record.games : {};
  const sanitizedGames = Object.fromEntries(
    Object.entries(DEFAULT_INCOMING_CHAT_GAME_PROFILES).map(([scene, fallback]) => [
      scene,
      sanitizeIncomingChatGameProfile(games[scene], fallback),
    ]),
  );

  return {
    enabled: record.enabled !== false,
    default_mode: normalizeIncomingChatMode(record.default_mode),
    capture_interval_ms: clampNumber(
      record.capture_interval_ms,
      DEFAULT_INCOMING_CHAT_CAPTURE_INTERVAL_MS,
      120,
      3_000,
    ),
    stable_debounce_ms: clampNumber(
      record.stable_debounce_ms,
      DEFAULT_INCOMING_CHAT_STABLE_DEBOUNCE_MS,
      120,
      5_000,
    ),
    frame_diff_threshold: clampNumber(
      record.frame_diff_threshold,
      DEFAULT_INCOMING_CHAT_FRAME_DIFF_THRESHOLD,
      0.001,
      1,
    ),
    dedupe_window_ms: clampNumber(
      record.dedupe_window_ms,
      DEFAULT_INCOMING_CHAT_DEDUPE_WINDOW_MS,
      1_000,
      60_000,
    ),
    overlay_duration_ms: clampNumber(
      record.overlay_duration_ms,
      DEFAULT_INCOMING_CHAT_OVERLAY_DURATION_MS,
      1_000,
      60_000,
    ),
    games: sanitizedGames,
  };
};

const defaultRuntimeConfigPath = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'runtime-config.json');

export const runtimeConfigPathFromEnv = (env) =>
  path.resolve(env.RUNTIME_CONFIG_PATH || defaultRuntimeConfigPath());

const sanitizeFastLaneConfig = (candidate, baseConfig) => {
  const record = isRecord(candidate) ? candidate : {};
  const provider = toProvider(record.provider || baseConfig.provider);
  const modelName = String(record.model_name || '').trim();

  return {
    enabled: record.enabled === true && Boolean(modelName),
    provider,
    api_url: normalizeApiUrlByProvider(record.api_url || baseConfig.api_url, provider),
    model_name: modelName,
    api_key_env_name:
      String(record.api_key_env_name || baseConfig.api_key_env_name || DEFAULT_API_KEY_ENV_NAME).trim() ||
      DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: clampNumber(
      record.timeout_ms,
      Math.min(baseConfig.timeout_ms || DEFAULT_TIMEOUT_MS, DEFAULT_FAST_LANE_TIMEOUT_MS),
      1_000,
      120_000,
    ),
    max_tokens: clampNumber(record.max_tokens, DEFAULT_FAST_LANE_MAX_TOKENS, 1, 4_096),
    temperature: clampNumber(record.temperature, DEFAULT_FAST_LANE_TEMPERATURE, 0, 2),
    max_text_length: clampNumber(
      record.max_text_length,
      DEFAULT_FAST_LANE_MAX_TEXT_LENGTH,
      1,
      4_096,
    ),
    allowed_prompt_variants: normalizePromptVariants(record.allowed_prompt_variants),
  };
};

const sanitizePublicContactConfig = (candidate) => {
  const record = isRecord(candidate) ? candidate : {};

  return {
    discord_url: withDefaultWhenMissing(record.discord_url, DEFAULT_CONTACT_DISCORD_URL),
    email: withDefaultWhenMissing(record.email, DEFAULT_CONTACT_EMAIL),
    qq_group: withDefaultWhenMissing(record.qq_group, DEFAULT_CONTACT_QQ_GROUP),
  };
};

const sanitizePublicSiteConfig = (candidate) => {
  const record = isRecord(candidate) ? candidate : {};

  return {
    contact: sanitizePublicContactConfig(record.contact),
  };
};

const sanitizeVisionLaneConfig = (candidate, baseConfig) => {
  const record = isRecord(candidate) ? candidate : {};
  const provider = toProvider(record.provider || baseConfig.provider);
  const modelName = String(record.model_name || DEFAULT_VISION_MODEL_NAME).trim();

  return {
    enabled: record.enabled === true && Boolean(modelName),
    provider,
    api_url: normalizeApiUrlByProvider(record.api_url || baseConfig.api_url, provider),
    model_name: modelName,
    api_key_env_name:
      String(record.api_key_env_name || baseConfig.api_key_env_name || DEFAULT_API_KEY_ENV_NAME).trim() ||
      DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: clampNumber(
      record.timeout_ms,
      Math.min(baseConfig.timeout_ms || DEFAULT_TIMEOUT_MS, DEFAULT_VISION_TIMEOUT_MS),
      1_000,
      120_000,
    ),
  };
};

export const sanitizeRuntimeConfig = (candidate, source = 'environment', updatedAt = null) => {
  const record = isRecord(candidate) ? candidate : {};
  const provider = toProvider(record.provider);
  const api_url = normalizeApiUrlByProvider(record.api_url, provider);
  const api_key_env_name =
    String(record.api_key_env_name || DEFAULT_API_KEY_ENV_NAME).trim() || DEFAULT_API_KEY_ENV_NAME;
  const timeout_ms = clampNumber(record.timeout_ms, DEFAULT_TIMEOUT_MS, 3_000, 120_000);
  const max_tokens = clampNumber(record.max_tokens, DEFAULT_MAX_TOKENS, 1, 4_096);
  const temperature = clampNumber(record.temperature, DEFAULT_TEMPERATURE, 0, 2);
  const model_name = String(record.model_name || DEFAULT_MODEL_NAME).trim() || DEFAULT_MODEL_NAME;

  const baseConfig = {
    provider,
    api_url,
    api_key_env_name,
    timeout_ms,
  };

  return {
    enabled: record.enabled !== false,
    provider,
    api_url,
    model_name,
    api_key_env_name,
    timeout_ms,
    max_tokens,
    temperature,
    fast_lane: sanitizeFastLaneConfig(record.fast_lane, baseConfig),
    vision_lane: sanitizeVisionLaneConfig(record.vision_lane, baseConfig),
    incoming_chat: sanitizeIncomingChatConfig(record.incoming_chat),
    public_site: sanitizePublicSiteConfig(record.public_site),
    source,
    updated_at: updatedAt,
  };
};

export const environmentRuntimeConfig = (env) => {
  const fastLaneEnabled = env.FAST_MODEL_ENABLED === 'true';

  return sanitizeRuntimeConfig(
    {
      enabled: env.MODEL_ENABLED !== 'false',
      provider: env.MODEL_PROVIDER || 'openai-compatible',
      api_url: env.MODEL_API_URL || defaultApiUrl('openai-compatible'),
      model_name: env.MODEL_NAME || DEFAULT_MODEL_NAME,
      api_key_env_name: env.MODEL_API_KEY_ENV_NAME || DEFAULT_API_KEY_ENV_NAME,
      timeout_ms: env.MODEL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
      max_tokens: env.MODEL_MAX_TOKENS || DEFAULT_MAX_TOKENS,
      temperature: env.MODEL_TEMPERATURE || DEFAULT_TEMPERATURE,
      fast_lane: {
        enabled: fastLaneEnabled,
        provider: env.FAST_MODEL_PROVIDER || env.MODEL_PROVIDER || 'openai-compatible',
        api_url: env.FAST_MODEL_API_URL || env.MODEL_API_URL || defaultApiUrl('openai-compatible'),
        model_name: fastLaneEnabled
          ? env.FAST_MODEL_NAME || DEFAULT_FAST_LANE_MODEL_NAME
          : env.FAST_MODEL_NAME || '',
        api_key_env_name:
          env.FAST_MODEL_API_KEY_ENV_NAME ||
          env.MODEL_API_KEY_ENV_NAME ||
          DEFAULT_API_KEY_ENV_NAME,
        timeout_ms: env.FAST_MODEL_TIMEOUT_MS || DEFAULT_FAST_LANE_TIMEOUT_MS,
        max_tokens: env.FAST_MODEL_MAX_TOKENS || DEFAULT_FAST_LANE_MAX_TOKENS,
        temperature: env.FAST_MODEL_TEMPERATURE || DEFAULT_FAST_LANE_TEMPERATURE,
        max_text_length: env.FAST_MODEL_MAX_TEXT_LENGTH || DEFAULT_FAST_LANE_MAX_TEXT_LENGTH,
        allowed_prompt_variants: env.FAST_MODEL_ALLOWED_PROMPT_VARIANTS
          ? env.FAST_MODEL_ALLOWED_PROMPT_VARIANTS.split(',')
          : DEFAULT_FAST_LANE_ALLOWED_PROMPT_VARIANTS,
      },
      vision_lane: {
        enabled: env.VISION_MODEL_ENABLED === 'true',
        provider: env.VISION_MODEL_PROVIDER || env.MODEL_PROVIDER || 'openai-compatible',
        api_url: env.VISION_MODEL_API_URL || env.MODEL_API_URL || defaultApiUrl('openai-compatible'),
        model_name: env.VISION_MODEL_NAME || DEFAULT_VISION_MODEL_NAME,
        api_key_env_name:
          env.VISION_MODEL_API_KEY_ENV_NAME ||
          env.MODEL_API_KEY_ENV_NAME ||
          DEFAULT_API_KEY_ENV_NAME,
        timeout_ms: env.VISION_MODEL_TIMEOUT_MS || DEFAULT_VISION_TIMEOUT_MS,
      },
      incoming_chat: {
        enabled: env.INCOMING_CHAT_ENABLED !== 'false',
        default_mode: env.INCOMING_CHAT_DEFAULT_MODE || DEFAULT_INCOMING_CHAT_DEFAULT_MODE,
        capture_interval_ms:
          env.INCOMING_CHAT_CAPTURE_INTERVAL_MS || DEFAULT_INCOMING_CHAT_CAPTURE_INTERVAL_MS,
        stable_debounce_ms:
          env.INCOMING_CHAT_STABLE_DEBOUNCE_MS || DEFAULT_INCOMING_CHAT_STABLE_DEBOUNCE_MS,
        frame_diff_threshold:
          env.INCOMING_CHAT_FRAME_DIFF_THRESHOLD || DEFAULT_INCOMING_CHAT_FRAME_DIFF_THRESHOLD,
        dedupe_window_ms:
          env.INCOMING_CHAT_DEDUPE_WINDOW_MS || DEFAULT_INCOMING_CHAT_DEDUPE_WINDOW_MS,
        overlay_duration_ms:
          env.INCOMING_CHAT_OVERLAY_DURATION_MS || DEFAULT_INCOMING_CHAT_OVERLAY_DURATION_MS,
        games: {
          dota2: {
            default_roi: {
              x: env.DOTA2_CHAT_ROI_X || DEFAULT_DOTA2_CHAT_ROI.x,
              y: env.DOTA2_CHAT_ROI_Y || DEFAULT_DOTA2_CHAT_ROI.y,
              width: env.DOTA2_CHAT_ROI_WIDTH || DEFAULT_DOTA2_CHAT_ROI.width,
              height: env.DOTA2_CHAT_ROI_HEIGHT || DEFAULT_DOTA2_CHAT_ROI.height,
            },
            auto_detect_enabled: env.DOTA2_CHAT_AUTO_DETECT_ENABLED !== 'false',
            vision_prompt_version: env.DOTA2_CHAT_VISION_PROMPT_VERSION || 'dota2-chat-v1',
          },
        },
      },
    },
    'environment',
  );
};

export const createSiliconFlowLatencyFirstRuntimeConfig = () => ({
  enabled: true,
  provider: 'openai-compatible',
  api_url: defaultApiUrl('openai-compatible'),
  model_name: DEFAULT_MODEL_NAME,
  api_key_env_name: DEFAULT_API_KEY_ENV_NAME,
  timeout_ms: DEFAULT_TIMEOUT_MS,
  max_tokens: DEFAULT_MAX_TOKENS,
  temperature: DEFAULT_TEMPERATURE,
  fast_lane: {
    enabled: true,
    provider: 'openai-compatible',
    api_url: defaultApiUrl('openai-compatible'),
    model_name: DEFAULT_FAST_LANE_MODEL_NAME,
    api_key_env_name: DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: DEFAULT_FAST_LANE_TIMEOUT_MS,
    max_tokens: DEFAULT_FAST_LANE_MAX_TOKENS,
    temperature: DEFAULT_FAST_LANE_TEMPERATURE,
    max_text_length: DEFAULT_FAST_LANE_MAX_TEXT_LENGTH,
    allowed_prompt_variants: [...DEFAULT_FAST_LANE_ALLOWED_PROMPT_VARIANTS],
  },
  vision_lane: {
    enabled: false,
    provider: 'openai-compatible',
    api_url: defaultApiUrl('openai-compatible'),
    model_name: DEFAULT_VISION_MODEL_NAME,
    api_key_env_name: DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: DEFAULT_VISION_TIMEOUT_MS,
  },
  incoming_chat: sanitizeIncomingChatConfig(),
  public_site: sanitizePublicSiteConfig(),
});

const setRuntimeConfigCache = (configPath, config) => {
  runtimeConfigCache = {
    config,
    configPath,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };
  return config;
};

const readRuntimeConfigFromSource = async (env, configPath) => {
  const fallback = () => environmentRuntimeConfig(env);

  try {
    const [raw, metadata] = await Promise.all([readFile(configPath, 'utf8'), stat(configPath)]);
    const updatedAt = metadata.mtime.toISOString();
    return sanitizeRuntimeConfig(JSON.parse(raw), 'file', updatedAt);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.name === 'SyntaxError')) {
      if (error.name === 'SyntaxError') {
        console.error('[translate-proxy] Invalid runtime config JSON, falling back to environment.');
      }
      return fallback();
    }
    throw error;
  }
};

export const loadRuntimeConfig = async (env = process.env, options = {}) => {
  const configPath = runtimeConfigPathFromEnv(env);
  const forceReload = options.forceReload === true;
  if (
    !forceReload &&
    runtimeConfigCache &&
    runtimeConfigCache.configPath === configPath &&
    runtimeConfigCache.expiresAt > Date.now()
  ) {
    return runtimeConfigCache.config;
  }

  const config = await readRuntimeConfigFromSource(env, configPath);
  return setRuntimeConfigCache(configPath, config);
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
  fast_lane: {
    enabled: config.fast_lane?.enabled === true,
    provider: toProvider(config.fast_lane?.provider || config.provider),
    api_url: String(config.fast_lane?.api_url || config.api_url || ''),
    model_name: String(config.fast_lane?.model_name || ''),
    api_key_env_name: String(
      config.fast_lane?.api_key_env_name || config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME,
    ),
    timeout_ms: Number(config.fast_lane?.timeout_ms || DEFAULT_FAST_LANE_TIMEOUT_MS),
    max_tokens: Number(config.fast_lane?.max_tokens || DEFAULT_FAST_LANE_MAX_TOKENS),
    temperature: Number(config.fast_lane?.temperature || DEFAULT_FAST_LANE_TEMPERATURE),
    max_text_length: Number(config.fast_lane?.max_text_length || DEFAULT_FAST_LANE_MAX_TEXT_LENGTH),
    allowed_prompt_variants: normalizePromptVariants(config.fast_lane?.allowed_prompt_variants),
  },
  vision_lane: {
    enabled: config.vision_lane?.enabled === true,
    provider: toProvider(config.vision_lane?.provider || config.provider),
    api_url: String(config.vision_lane?.api_url || config.api_url || ''),
    model_name: String(config.vision_lane?.model_name || ''),
    api_key_env_name: String(
      config.vision_lane?.api_key_env_name || config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME,
    ),
    timeout_ms: Number(config.vision_lane?.timeout_ms || DEFAULT_VISION_TIMEOUT_MS),
  },
  incoming_chat: sanitizeIncomingChatConfig(config.incoming_chat),
  public_site: {
    contact: {
      discord_url: normalizeString(config.public_site?.contact?.discord_url),
      email: normalizeString(config.public_site?.contact?.email),
      qq_group: normalizeString(config.public_site?.contact?.qq_group),
    },
  },
});

export const persistRuntimeConfig = async (env, config) => {
  const configPath = runtimeConfigPathFromEnv(env);
  const normalized = sanitizeRuntimeConfig(config, 'file', new Date().toISOString());
  const serialized = JSON.stringify(toPersistedRuntimeConfig(normalized), null, 2);

  await mkdir(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, `${serialized}\n`, 'utf8');
  await rename(tempPath, configPath);

  return loadRuntimeConfig(env, { forceReload: true });
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
  fast_lane: {
    enabled: config.fast_lane?.enabled === true,
    provider: config.fast_lane?.provider || config.provider,
    model: config.fast_lane?.model_name || null,
    api_url: config.fast_lane?.api_url || config.api_url,
    api_key_env_name:
      config.fast_lane?.api_key_env_name || config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: config.fast_lane?.timeout_ms || DEFAULT_FAST_LANE_TIMEOUT_MS,
    max_tokens: config.fast_lane?.max_tokens || DEFAULT_FAST_LANE_MAX_TOKENS,
    temperature: config.fast_lane?.temperature || DEFAULT_FAST_LANE_TEMPERATURE,
    max_text_length: config.fast_lane?.max_text_length || DEFAULT_FAST_LANE_MAX_TEXT_LENGTH,
    allowed_prompt_variants: normalizePromptVariants(config.fast_lane?.allowed_prompt_variants),
  },
  vision_lane: {
    enabled: config.vision_lane?.enabled === true,
    provider: config.vision_lane?.provider || config.provider,
    model: config.vision_lane?.model_name || null,
    api_url: config.vision_lane?.api_url || config.api_url,
    api_key_env_name:
      config.vision_lane?.api_key_env_name || config.api_key_env_name || DEFAULT_API_KEY_ENV_NAME,
    timeout_ms: config.vision_lane?.timeout_ms || DEFAULT_VISION_TIMEOUT_MS,
  },
  incoming_chat: sanitizeIncomingChatConfig(config.incoming_chat),
  config_source: config.source,
  updated_at: config.updated_at,
});

export const summarizePublicSiteConfig = (config) => ({
  contact: {
    discord_url: config.public_site?.contact?.discord_url || DEFAULT_CONTACT_DISCORD_URL,
    email: config.public_site?.contact?.email || DEFAULT_CONTACT_EMAIL,
    qq_group: config.public_site?.contact?.qq_group || DEFAULT_CONTACT_QQ_GROUP,
  },
  config_source: config.source,
  updated_at: config.updated_at,
});

export const summarizePublicClientConfig = (config) => ({
  incoming_chat: sanitizeIncomingChatConfig(config.incoming_chat),
  vision_lane: {
    enabled: config.vision_lane?.enabled === true,
    provider: config.vision_lane?.provider || config.provider,
    model: config.vision_lane?.model_name || null,
  },
  config_source: config.source,
  updated_at: config.updated_at,
});
