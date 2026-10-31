import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_UI_THEME,
  normalizeUiTheme,
  readPreviewUiTheme,
  readUiThemePreference,
  writeUiThemePreference,
} from '../services/settingsStore';

const ThemeContext = createContext(null);

const applyThemeToDocument = (theme) => {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.setAttribute('data-theme', theme);
};

/**
 * Theme preference: dark by default, light as an opt-in setting.
 * The value lives outside the Rust-owned settings object so it survives
 * backend round-trips, mirroring how the UI locale is stored.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readPreviewUiTheme() || DEFAULT_UI_THEME);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    void readUiThemePreference().then((stored) => {
      if (!disposed && stored && stored !== theme) {
        setThemeState(stored);
      }
    });
    return () => {
      disposed = true;
    };
    // Only reconcile with persisted storage once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const normalized = normalizeUiTheme(nextTheme);
    setThemeState(normalized);
    void writeUiThemePreference(normalized);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, isDark: theme !== 'light' }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be called inside a ThemeProvider');
  }
  return context;
};
