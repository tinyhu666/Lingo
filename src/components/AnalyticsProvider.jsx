import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '../i18n/I18nProvider';
import {
  startDesktopAnalytics,
  trackTranslationDiagnostic,
} from '../services/analyticsService';
import { hasTauriRuntime } from '../services/tauriRuntime';

export function AnalyticsProvider({ children }) {
  const { locale } = useI18n();
  const latestLocaleRef = useRef(locale);
  latestLocaleRef.current = locale;

  useEffect(() => {
    void startDesktopAnalytics({
      getLocale: () => latestLocaleRef.current,
    });
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let unlisten = null;

    void listen('translation_diagnostic', (event) => {
      void trackTranslationDiagnostic(event.payload);
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.warn('Failed to listen for translation diagnostics:', error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return children;
}
