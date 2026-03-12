import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  UI_LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
  messages,
} from './messages';

const I18nContext = createContext(null);
const SYSTEM_FALLBACK_LOCALE = 'en-US';

function resolveSupportedLocale(locale) {
  const raw = String(locale || '').trim().toLowerCase();
  if (raw.startsWith('zh')) {
    return 'zh-CN';
  }
  if (raw.startsWith('en')) {
    return 'en-US';
  }
  if (raw.startsWith('ru')) {
    return 'ru-RU';
  }
  return null;
}

function normalizeLocale(locale) {
  return resolveSupportedLocale(locale) || DEFAULT_LOCALE;
}

function resolveLocaleFromSystem() {
  if (typeof navigator === 'undefined') {
    return SYSTEM_FALLBACK_LOCALE;
  }

  const candidates = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }
  if (typeof navigator.language === 'string' && navigator.language) {
    candidates.push(navigator.language);
  }

  for (const candidate of candidates) {
    const normalized = resolveSupportedLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return SYSTEM_FALLBACK_LOCALE;
}

function readInitialLocale() {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  try {
    const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    if (stored) {
      const normalizedStored = resolveSupportedLocale(stored);
      if (normalizedStored) {
        return normalizedStored;
      }
    }
  } catch {
    // ignore localStorage read failures
  }

  return resolveLocaleFromSystem();
}

function getPathValue(source, keyPath) {
  return keyPath.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) {
      return acc[segment];
    }
    return undefined;
  }, source);
}

function applyInterpolation(template, vars) {
  if (!vars || typeof template !== 'string') {
    return template;
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return `{{${key}}}`;
  });
}

function buildLocaleOptions() {
  return SUPPORTED_LOCALES.map((value) => ({
    value,
    label: LOCALE_DISPLAY_NAMES[value] || value,
  }));
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readInitialLocale);

  const setLocale = useCallback((nextLocale) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalized);
      } catch {
        // ignore localStorage write failures
      }
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      const active = messages[locale] || {};
      const fallback = messages[DEFAULT_LOCALE] || {};
      const hit = getPathValue(active, key);
      const fallbackHit = getPathValue(fallback, key);
      const template = hit ?? fallbackHit ?? key;
      return applyInterpolation(template, vars);
    },
    [locale],
  );

  const localeOptions = useMemo(() => buildLocaleOptions(), []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      localeOptions,
      defaultLocale: DEFAULT_LOCALE,
    }),
    [locale, setLocale, t, localeOptions],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}
