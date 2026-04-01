import { hasTauriRuntime, invokeIfPossible } from './tauriRuntime';

const BACKEND_CONFIG_COMMAND = 'get_public_backend_config';
const PUBLIC_SITE_CONFIG_PATH = '/public/site-config';

const DEFAULT_CONTACT = Object.freeze({
  discordUrl: 'https://discord.gg/cWB49jCfdP',
  email: 'huruiw@outlook.com',
  qqGroup: '1095706752',
});

export const DEFAULT_PUBLIC_SITE_CONFIG = Object.freeze({
  contact: DEFAULT_CONTACT,
  source: 'fallback:default',
  updatedAt: null,
});

let hasResolvedPublicSiteConfig = false;
let cachedPublicSiteConfig = DEFAULT_PUBLIC_SITE_CONFIG;
let inflightPublicSiteConfigPromise = null;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNonEmptyString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const normalizeBackendBaseUrl = (value) => {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed.endsWith('/translate') ? trimmed.slice(0, -'/translate'.length) : trimmed;
};

const normalizePublicSiteConfig = (payload) => {
  const record = isRecord(payload) ? payload : {};
  const contact = isRecord(record.contact) ? record.contact : {};

  return {
    contact: {
      discordUrl: toNonEmptyString(contact.discordUrl || contact.discord_url) || DEFAULT_CONTACT.discordUrl,
      email: toNonEmptyString(contact.email) || DEFAULT_CONTACT.email,
      qqGroup: toNonEmptyString(contact.qqGroup || contact.qq_group) || DEFAULT_CONTACT.qqGroup,
    },
    source: toNonEmptyString(record.source || record.config_source) || DEFAULT_PUBLIC_SITE_CONFIG.source,
    updatedAt: toNonEmptyString(record.updatedAt || record.updated_at),
  };
};

const resolveDesktopBackendBaseUrl = async () => {
  const config = await invokeIfPossible(BACKEND_CONFIG_COMMAND, {}, null);
  return normalizeBackendBaseUrl(config?.baseUrl || config?.base_url);
};

const resolveWebBackendBaseUrl = () => {
  const envBaseUrl = normalizeBackendBaseUrl(
    import.meta.env.VITE_PUBLIC_BACKEND_URL || import.meta.env.VITE_LINGO_BACKEND_URL,
  );
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  if (window.location?.protocol === 'file:') {
    return null;
  }

  return normalizeBackendBaseUrl(window.location?.origin);
};

const resolveBackendBaseUrl = async () => {
  if (hasTauriRuntime()) {
    return (await resolveDesktopBackendBaseUrl()) || resolveWebBackendBaseUrl();
  }

  return resolveWebBackendBaseUrl();
};

const fetchPublicSiteConfig = async () => {
  const baseUrl = await resolveBackendBaseUrl();
  if (!baseUrl) {
    return DEFAULT_PUBLIC_SITE_CONFIG;
  }

  const response = await fetch(`${baseUrl}${PUBLIC_SITE_CONFIG_PATH}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load public site config (${response.status})`);
  }

  return normalizePublicSiteConfig(await response.json());
};

export const loadPublicSiteConfig = async ({ forceReload = false } = {}) => {
  if (!forceReload && hasResolvedPublicSiteConfig) {
    return cachedPublicSiteConfig;
  }

  if (!forceReload && inflightPublicSiteConfigPromise) {
    return inflightPublicSiteConfigPromise;
  }

  inflightPublicSiteConfigPromise = (async () => {
    try {
      cachedPublicSiteConfig = await fetchPublicSiteConfig();
      hasResolvedPublicSiteConfig = true;
      return cachedPublicSiteConfig;
    } catch (error) {
      console.warn('Failed to load public site config, falling back to defaults.', error);
      return cachedPublicSiteConfig;
    } finally {
      inflightPublicSiteConfigPromise = null;
    }
  })();

  return inflightPublicSiteConfigPromise;
};
