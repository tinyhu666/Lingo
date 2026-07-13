import { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './Sidebar';
import DropdownMenu from './DropdownMenu';
import { AnalyticsProvider } from './AnalyticsProvider';
import { StoreProvider } from './StoreProvider';
import { UpdateProvider } from './UpdateProvider';
import appIcon from '../assets/app-icon.png';
import { ChevronRight, Globe, Minus, XClose } from '../icons';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showInfo } from '../utils/toast';
import { useI18n } from '../i18n/I18nProvider';

function LayoutShell({ children, activeItem, setActiveItem }) {
  const { locale, setLocale, t, localeOptions } = useI18n();
  const [showLocaleMenu, setShowLocaleMenu] = useState(false);
  const localeTriggerRef = useRef(null);
  const busyToastAtRef = useRef(0);

  const localeMap = useMemo(
    () =>
      localeOptions.reduce((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [localeOptions],
  );

  const currentLocaleLabel = useMemo(() => {
    const matched = localeOptions.find((item) => item.value === locale);
    return matched?.label || locale;
  }, [locale, localeOptions]);

  const handleWindowAction = async (action) => {
    if (!hasTauriRuntime()) {
      return;
    }

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      if (action === 'minimize') {
        await appWindow.minimize();
        return;
      }

      if (action === 'close') {
        await appWindow.close();
      }
    } catch (error) {
      console.error('Window action failed', { action, error });
      showError(action === 'minimize' ? t('titlebar.minimizeFailed') : t('titlebar.actionFailed'));
    }
  };

  const translatorRef = useRef(t);
  useEffect(() => {
    translatorRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let cleanups = [];

    const bind = async () => {
      try {
        const [unlistenFailed, unlistenBusy] = await Promise.all([
          listen('translation_failed', (event) => {
            const translate = translatorRef.current;
            const message =
              typeof event.payload === 'string' && event.payload.trim()
                ? event.payload
                : translate('titlebar.translationFailed');
            showError(message);
          }),
          listen('translation_busy', (event) => {
            const now = Date.now();
            if (now - busyToastAtRef.current < 1200) {
              return;
            }

            busyToastAtRef.current = now;
            const translate = translatorRef.current;
            const message =
              typeof event.payload === 'string' && event.payload.trim() && event.payload !== 'busy'
                ? event.payload
                : translate('titlebar.translationBusy');
            showInfo(message);
          }),
        ]);

        if (disposed) {
          unlistenFailed();
          unlistenBusy();
          return;
        }

        cleanups = [unlistenFailed, unlistenBusy];
      } catch (error) {
        console.error('Failed to bind translation event listeners', error);
      }
    };

    void bind();

    return () => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  return (
    <div className='lg-win'>
      <header className='lg-titlebar'>
        <div className='lg-titlebar__brand' data-tauri-drag-region>
          <div
            className='lg-titlebar__icon'
            style={{ background: 'transparent', boxShadow: 'none' }}>
            <img src={appIcon} alt='Lingo' style={{ width: 18, height: 18 }} />
          </div>
          <span className='lg-titlebar__title'>Lingo</span>
        </div>

        <div className='lg-titlebar__drag' data-tauri-drag-region />

        <div className='lg-titlebar__controls'>
          <div ref={localeTriggerRef} style={{ position: 'relative' }}>
            <button
              type='button'
              className='lg-locale'
              aria-label={t('locale.label')}
              aria-haspopup='menu'
              aria-expanded={showLocaleMenu}
              title={t('locale.label')}
              onClick={() => setShowLocaleMenu((current) => !current)}>
              <Globe aria-hidden='true' />
              <span>{currentLocaleLabel}</span>
              <ChevronRight aria-hidden='true' />
            </button>
            <DropdownMenu
              show={showLocaleMenu}
              onClose={() => setShowLocaleMenu(false)}
              options={localeMap}
              currentValue={locale}
              onSelect={(nextLocale) => {
                setLocale(nextLocale);
                setShowLocaleMenu(false);
              }}
              anchorPosition='right-0'
              direction='down'
              anchorRef={localeTriggerRef}
            />
          </div>

          <button
            type='button'
            className='lg-winbtn'
            aria-label={t('titlebar.minimizeAria')}
            title={t('titlebar.minimizeTitle')}
            onClick={() => {
              void handleWindowAction('minimize');
            }}>
            <Minus aria-hidden='true' />
          </button>
          <button
            type='button'
            className='lg-winbtn lg-winbtn--close'
            aria-label={t('titlebar.closeAria')}
            title={t('titlebar.closeTitle')}
            onClick={() => {
              void handleWindowAction('close');
            }}>
            <XClose aria-hidden='true' />
          </button>
        </div>
      </header>

      <Toaster
        gutter={12}
        containerClassName='lingo-toast-stack'
        toastOptions={{
          className: 'lingo-toast',
        }}
      />

      <div className='lg-shell'>
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
        <section className='lg-workspace'>{children}</section>
      </div>
    </div>
  );
}

export default function Layout({ children, activeItem, setActiveItem }) {
  return (
    <StoreProvider>
      <AnalyticsProvider>
        <UpdateProvider>
          <LayoutShell activeItem={activeItem} setActiveItem={setActiveItem}>
            {children}
          </LayoutShell>
        </UpdateProvider>
      </AnalyticsProvider>
    </StoreProvider>
  );
}
