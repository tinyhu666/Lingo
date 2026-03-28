import { load } from '@tauri-apps/plugin-store';
import { hasTauriRuntime, invokeCommand } from './tauriRuntime';
import { UI_LOCALE_STORAGE_KEY } from '../i18n/messages';
import { DEFAULT_GAME_SCENE, normalizeGameScene } from '../constants/gameScenes';
import { normalizeAnalyticsQueue, normalizeAnalyticsState, toNonEmptyString } from './analyticsUtils';

const STORE_FILE = 'store.json';
const SETTINGS_KEY = 'settings';
const UI_LOCALE_KEY = 'ui_locale';
const INSTALLATION_ID_KEY = 'installation_id';
const ANALYTICS_STATE_KEY = 'analytics';
const ANALYTICS_QUEUE_KEY = 'analytics_queue';
const WEB_SETTINGS_KEY = 'lingo.settings';
const WEB_INSTALLATION_ID_KEY = 'lingo.installation_id';
const WEB_ANALYTICS_STATE_KEY = 'lingo.analytics';
const WEB_ANALYTICS_QUEUE_KEY = 'lingo.analytics_queue';
const PREVIOUS_WEB_SETTINGS_KEY = 'cliplingo.settings';
const LEGACY_WEB_SETTINGS_KEY = ['auto', 'gg.settings'].join('');

let storeInstancePromise = null;

const normalizeSettingsPayload = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }

  return {
    ...settings,
    game_scene: normalizeGameScene(settings.game_scene || DEFAULT_GAME_SCENE),
  };
};

const getStore = async () => {
  if (!storeInstancePromise) {
    storeInstancePromise = load(STORE_FILE, { autoSave: 100 });
  }
  return storeInstancePromise;
};

export const readPreviewSettings = () => {
  try {
    const raw = localStorage.getItem(WEB_SETTINGS_KEY);
    if (raw) {
      return normalizeSettingsPayload(JSON.parse(raw));
    }

    // Migrate previous keys to keep old settings after rebrand.
    const previousRaw = localStorage.getItem(PREVIOUS_WEB_SETTINGS_KEY);
    if (previousRaw) {
      const previous = normalizeSettingsPayload(JSON.parse(previousRaw));
      localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(previous));
      localStorage.removeItem(PREVIOUS_WEB_SETTINGS_KEY);
      return previous;
    }

    const legacyRaw = localStorage.getItem(LEGACY_WEB_SETTINGS_KEY);
    if (!legacyRaw) {
      return null;
    }

    const legacy = normalizeSettingsPayload(JSON.parse(legacyRaw));
    localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_WEB_SETTINGS_KEY);
    return legacy;
  } catch {
    return null;
  }
};

export const writePreviewSettings = (settings) => {
  try {
    localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(normalizeSettingsPayload(settings)));
  } catch {
    // ignore preview write errors
  }
};

export const writePreviewUiLocale = (locale) => {
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore preview write errors
  }
};

const readPreviewJson = (storageKey, normalizer = (value) => value) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return normalizer(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writePreviewJson = (storageKey, value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(storageKey);
      return true;
    }

    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const readStoreValue = async (key, fallback = null) => {
  try {
    const store = await getStore();
    const value = await store.get(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStoreValue = async (key, value) => {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
};

export const writeUiLocalePreference = async (locale) => {
  const normalized = String(locale || '').trim();
  if (!normalized) {
    return false;
  }

  writePreviewUiLocale(normalized);

  if (!hasTauriRuntime()) {
    return true;
  }

  try {
    const store = await getStore();
    await store.set(UI_LOCALE_KEY, normalized);
    await store.save();
    return true;
  } catch (error) {
    console.warn('Failed to persist UI locale preference:', error);
    return false;
  }
};

export const readSettingsFromBackend = async () => {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    return normalizeSettingsPayload(await invokeCommand('get_settings'));
  } catch {
    return null;
  }
};

export const readSettingsFromStore = async () => {
  try {
    return normalizeSettingsPayload(await readStoreValue(SETTINGS_KEY));
  } catch {
    return null;
  }
};

export const writeSettingsToStore = async (settings) => {
  const normalized = normalizeSettingsPayload(settings);
  if (!hasTauriRuntime()) {
    writePreviewSettings(normalized);
    return true;
  }

  try {
    const store = await getStore();
    await store.set(SETTINGS_KEY, normalized);
    await store.save();
    writePreviewSettings(normalized);
    return true;
  } catch (error) {
    writePreviewSettings(normalized);
    throw error;
  }
};

export const readInstallationId = async () => {
  const previewInstallationId = toNonEmptyString(readPreviewJson(WEB_INSTALLATION_ID_KEY));

  if (!hasTauriRuntime()) {
    return previewInstallationId;
  }

  const storedInstallationId = toNonEmptyString(await readStoreValue(INSTALLATION_ID_KEY));
  return storedInstallationId || previewInstallationId;
};

export const writeInstallationId = async (installationId) => {
  const normalized = toNonEmptyString(installationId);
  if (!normalized) {
    return false;
  }

  writePreviewJson(WEB_INSTALLATION_ID_KEY, normalized);

  if (!hasTauriRuntime()) {
    return true;
  }

  try {
    await writeStoreValue(INSTALLATION_ID_KEY, normalized);
    return true;
  } catch (error) {
    console.warn('Failed to persist installation id:', error);
    return false;
  }
};

export const readAnalyticsState = async () => {
  const previewAnalyticsState = normalizeAnalyticsState(readPreviewJson(WEB_ANALYTICS_STATE_KEY));

  if (!hasTauriRuntime()) {
    return previewAnalyticsState;
  }

  const storedAnalyticsState = normalizeAnalyticsState(await readStoreValue(ANALYTICS_STATE_KEY));

  return {
    ...previewAnalyticsState,
    ...storedAnalyticsState,
  };
};

export const writeAnalyticsState = async (analyticsState) => {
  const normalized = normalizeAnalyticsState(analyticsState);
  writePreviewJson(WEB_ANALYTICS_STATE_KEY, normalized);

  if (!hasTauriRuntime()) {
    return true;
  }

  try {
    await writeStoreValue(ANALYTICS_STATE_KEY, normalized);
    return true;
  } catch (error) {
    console.warn('Failed to persist analytics state:', error);
    return false;
  }
};

export const readAnalyticsQueue = async () => {
  const previewAnalyticsQueue = normalizeAnalyticsQueue(readPreviewJson(WEB_ANALYTICS_QUEUE_KEY));

  if (!hasTauriRuntime()) {
    return previewAnalyticsQueue;
  }

  const storedAnalyticsQueue = await readStoreValue(ANALYTICS_QUEUE_KEY, undefined);
  if (storedAnalyticsQueue === undefined) {
    return previewAnalyticsQueue;
  }

  return normalizeAnalyticsQueue(storedAnalyticsQueue);
};

export const writeAnalyticsQueue = async (analyticsQueue) => {
  const normalized = normalizeAnalyticsQueue(analyticsQueue);
  writePreviewJson(WEB_ANALYTICS_QUEUE_KEY, normalized);

  if (!hasTauriRuntime()) {
    return true;
  }

  try {
    await writeStoreValue(ANALYTICS_QUEUE_KEY, normalized);
    return true;
  } catch (error) {
    console.warn('Failed to persist analytics queue:', error);
    return false;
  }
};

export const loadInitialSettings = async () => {
  const fromBackend = await readSettingsFromBackend();
  if (fromBackend) {
    return normalizeSettingsPayload(fromBackend);
  }

  const fromStore = await readSettingsFromStore();
  if (fromStore) {
    return normalizeSettingsPayload(fromStore);
  }

  return normalizeSettingsPayload(readPreviewSettings());
};
