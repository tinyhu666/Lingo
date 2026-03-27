import { load } from '@tauri-apps/plugin-store';
import { hasTauriRuntime, invokeCommand } from './tauriRuntime';
import { UI_LOCALE_STORAGE_KEY } from '../i18n/messages';
import { DEFAULT_GAME_SCENE, normalizeGameScene } from '../constants/gameScenes';

const STORE_FILE = 'store.json';
const SETTINGS_KEY = 'settings';
const UI_LOCALE_KEY = 'ui_locale';
const WEB_SETTINGS_KEY = 'lingo.settings';
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
    const store = await getStore();
    return normalizeSettingsPayload(await store.get(SETTINGS_KEY));
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
