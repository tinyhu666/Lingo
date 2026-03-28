import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { startDesktopAnalytics } from '../services/analyticsService';

export function AnalyticsProvider({ children }) {
  const { locale } = useI18n();
  const latestLocaleRef = useRef(locale);
  latestLocaleRef.current = locale;

  useEffect(() => {
    void startDesktopAnalytics({
      getLocale: () => latestLocaleRef.current,
    });
  }, []);

  return children;
}

