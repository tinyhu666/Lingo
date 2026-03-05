import { load } from '@tauri-apps/plugin-store';
import { hasTauriRuntime, invokeCommand } from './tauriRuntime';

const STORE_FILE = 'store.json';
const SETTINGS_KEY = 'settings';
const WEB_SETTINGS_KEY = 'cliplingo.settings';
const LEGACY_WEB_SETTINGS_KEY = ['auto', 'gg.settings'].join('');

let storeInstancePromise = null;

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
      return JSON.parse(raw);
    }

    // Migrate legacy preview key to keep old settings after rebrand.
    const legacyRaw = localStorage.getItem(LEGACY_WEB_SETTINGS_KEY);
    if (!legacyRaw) {
      return null;
    }

    const legacy = JSON.parse(legacyRaw);
    localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_WEB_SETTINGS_KEY);
    return legacy;
  } catch {
    return null;
  }
};

export const writePreviewSettings = (settings) => {
  try {
    localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore preview write errors
  }
};

export const readSettingsFromBackend = async () => {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    return await invokeCommand('get_settings');
  } catch {
    return null;
  }
};

export const readSettingsFromStore = async () => {
  try {
    const store = await getStore();
    return await store.get(SETTINGS_KEY);
  } catch {
    return null;
  }
};

export const writeSettingsToStore = async (settings) => {
  try {
    const store = await getStore();
    await store.set(SETTINGS_KEY, settings);
    return true;
  } catch {
    writePreviewSettings(settings);
    return false;
  }
};

export const loadInitialSettings = async () => {
  const fromBackend = await readSettingsFromBackend();
  if (fromBackend) {
    return fromBackend;
  }

  const fromStore = await readSettingsFromStore();
  if (fromStore) {
    return fromStore;
  }

  return readPreviewSettings();
};
