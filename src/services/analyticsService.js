import { APP_VERSION } from '../constants/version';
import { getDesktopPlatform } from '../utils/platform';
import {
  readAnalyticsQueue,
  readAnalyticsState,
  readInstallationId,
  writeAnalyticsQueue,
  writeAnalyticsState,
  writeInstallationId,
} from './settingsStore';
import { hasTauriRuntime, invokeCommand } from './tauriRuntime';
import {
  getAnalyticsDayKey,
  normalizeAnalyticsEvent,
  normalizeAnalyticsQueue,
  normalizeAnalyticsState,
  toNonEmptyString,
} from './analyticsUtils';

const BACKEND_CONFIG_COMMAND = 'get_public_backend_config';
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const FLUSH_BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 10_000;

const LIFECYCLE_EVENTS = {
  install: 'install_registered',
  launch: 'app_launch',
  activePing: 'app_active_ping',
  updateApplied: 'update_applied',
};

let startupPromise = null;
let heartbeatIntervalId = null;
let analyticsContextPromise = null;
let operationQueue = Promise.resolve();
let localeGetter = () => 'unknown';

const generateInstallationId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `lingo-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const resolveLocale = () => {
  const nextLocale = typeof localeGetter === 'function' ? localeGetter() : null;
  return String(nextLocale || 'unknown').trim() || 'unknown';
};

const resolvePlatform = () => getDesktopPlatform() || 'desktop';

const buildBaseEvent = (installationId, sessionId, occurredAt) => ({
  installation_id: installationId,
  session_id: sessionId,
  occurred_at: occurredAt,
  analytics_day: getAnalyticsDayKey(new Date(occurredAt)),
  platform: resolvePlatform(),
  app_version: APP_VERSION,
  ui_locale: resolveLocale(),
  runtime: 'tauri-desktop',
});

const serializeOperation = (task) => {
  const run = operationQueue.then(task, task);
  operationQueue = run.catch(() => undefined);
  return run;
};

const normalizeBackendBaseUrl = (value) => {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed.endsWith('/translate') ? trimmed.slice(0, -'/translate'.length) : trimmed;
};

const ensureInstallationId = async () => {
  const storedInstallationId = await readInstallationId();
  if (storedInstallationId) {
    return storedInstallationId;
  }

  const installationId = generateInstallationId();
  await writeInstallationId(installationId);
  return installationId;
};

const loadBackendConfig = async () => {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    const config = await invokeCommand(BACKEND_CONFIG_COMMAND);
    const baseUrl = normalizeBackendBaseUrl(config?.baseUrl || config?.base_url);
    if (!baseUrl) {
      return null;
    }

    const publicKey = toNonEmptyString(config?.publicKey || config?.public_key);

    return {
      baseUrl,
      eventsUrl: `${baseUrl}/analytics/events`,
      publicKey,
      source: toNonEmptyString(config?.source),
      publicKeySource: toNonEmptyString(config?.publicKeySource || config?.public_key_source),
    };
  } catch (error) {
    console.warn('Failed to resolve analytics backend config:', error);
    return null;
  }
};

const createAnalyticsContext = async () => ({
  installationId: await ensureInstallationId(),
  analyticsState: normalizeAnalyticsState(await readAnalyticsState()),
  queue: normalizeAnalyticsQueue(await readAnalyticsQueue()),
  sessionId: generateInstallationId(),
  backendConfig: await loadBackendConfig(),
});

const getAnalyticsContext = async () => {
  if (!analyticsContextPromise) {
    analyticsContextPromise = createAnalyticsContext().catch((error) => {
      analyticsContextPromise = null;
      throw error;
    });
  }

  return analyticsContextPromise;
};

const persistAnalyticsContext = async (context) => {
  await Promise.all([writeAnalyticsState(context.analyticsState), writeAnalyticsQueue(context.queue)]);
};

const enqueueLifecycleEvent = (context, eventName, occurredAt, properties = {}) => {
  const normalizedEvent = normalizeAnalyticsEvent({
    ...buildBaseEvent(context.installationId, context.sessionId, occurredAt),
    event_name: eventName,
    ...properties,
  });

  if (!normalizedEvent) {
    return null;
  }

  context.queue = normalizeAnalyticsQueue([...context.queue, normalizedEvent]);
  return normalizedEvent;
};

const trackActivePingIfNeeded = (context, now = new Date()) => {
  const analyticsDay = getAnalyticsDayKey(now);
  if (context.analyticsState.last_active_ping_date === analyticsDay) {
    return false;
  }

  const occurredAt = now.toISOString();
  const event = enqueueLifecycleEvent(context, LIFECYCLE_EVENTS.activePing, occurredAt, {
    analytics_day: analyticsDay,
  });
  if (!event) {
    return false;
  }

  context.analyticsState = normalizeAnalyticsState({
    ...context.analyticsState,
    last_active_ping_date: analyticsDay,
  });

  return true;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timerId);
  }
};

const flushAnalyticsQueue = async (context) => {
  if (!context.queue.length) {
    return { flushed: 0, pending: 0 };
  }

  if (!context.backendConfig?.eventsUrl) {
    context.backendConfig = await loadBackendConfig();
  }

  if (!context.backendConfig?.eventsUrl) {
    return { flushed: 0, pending: context.queue.length };
  }

  let flushed = 0;

  while (context.queue.length > 0) {
    const batch = context.queue.slice(0, FLUSH_BATCH_SIZE);
    const headers = {
      'Content-Type': 'application/json',
    };

    if (context.backendConfig.publicKey) {
      headers.apikey = context.backendConfig.publicKey;
      headers.Authorization = `Bearer ${context.backendConfig.publicKey}`;
    }

    let response;

    try {
      response = await fetchWithTimeout(context.backendConfig.eventsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: batch }),
      });
    } catch (error) {
      console.warn('Failed to flush analytics queue:', error);
      break;
    }

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      console.warn('Analytics batch request failed:', response.status, message);
      break;
    }

    context.queue = context.queue.slice(batch.length);
    flushed += batch.length;
    await writeAnalyticsQueue(context.queue);
  }

  return {
    flushed,
    pending: context.queue.length,
  };
};

const runStartupLifecycle = async () => {
  const context = await getAnalyticsContext();
  const occurredAt = new Date().toISOString();

  if (!context.analyticsState.install_reported_at) {
    const installEvent = enqueueLifecycleEvent(context, LIFECYCLE_EVENTS.install, occurredAt);
    if (installEvent) {
      context.analyticsState = normalizeAnalyticsState({
        ...context.analyticsState,
        install_reported_at: occurredAt,
      });
    }
  }

  enqueueLifecycleEvent(context, LIFECYCLE_EVENTS.launch, occurredAt);

  if (
    context.analyticsState.last_seen_version &&
    context.analyticsState.last_seen_version !== APP_VERSION
  ) {
    enqueueLifecycleEvent(context, LIFECYCLE_EVENTS.updateApplied, occurredAt, {
      previous_app_version: context.analyticsState.last_seen_version,
      current_app_version: APP_VERSION,
    });
  }

  context.analyticsState = normalizeAnalyticsState({
    ...context.analyticsState,
    last_seen_version: APP_VERSION,
  });

  trackActivePingIfNeeded(context, new Date(occurredAt));
  await persistAnalyticsContext(context);
  await flushAnalyticsQueue(context);

  return {
    installationId: context.installationId,
    enabled: Boolean(context.backendConfig?.eventsUrl),
  };
};

export const startDesktopAnalytics = async ({ getLocale } = {}) => {
  if (!hasTauriRuntime()) {
    return { installationId: null, enabled: false };
  }

  if (typeof getLocale === 'function') {
    localeGetter = getLocale;
  }

  if (!startupPromise) {
    startupPromise = serializeOperation(runStartupLifecycle).catch((error) => {
      startupPromise = null;
      console.error('Failed to bootstrap analytics lifecycle', error);
      return { installationId: null, enabled: false };
    });
  }

  const result = await startupPromise;

  if (heartbeatIntervalId === null && typeof window !== 'undefined') {
    heartbeatIntervalId = window.setInterval(() => {
      void serializeOperation(async () => {
        const context = await getAnalyticsContext();
        const activePingTriggered = trackActivePingIfNeeded(context);
        if (activePingTriggered) {
          await persistAnalyticsContext(context);
        }
        await flushAnalyticsQueue(context);
      }).catch((error) => {
        console.warn('Analytics heartbeat failed:', error);
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  return result;
};
