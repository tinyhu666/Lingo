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
            const message =
              typeof event.payload === 'string' && event.payload.trim()
                ? event.payload
                : t('titlebar.translationFailed');
            showError(message);
          }),
          listen('translation_busy', (event) => {
            const now = Date.now();
            if (now - busyToastAtRef.current < 1200) {
              return;
            }

            busyToastAtRef.current = now;
            const message =
              typeof event.payload === 'string' && event.payload.trim() && event.payload !== 'busy'
                ? event.payload
                : t('titlebar.translationBusy');
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
  }, [t]);

  return (
    <div className='lingo-app-shell'>
      <header className='lingo-titlebar'>
        <div className='lingo-titlebar__brand' data-tauri-drag-region>
          <img src={appIcon} alt='Lingo' className='lingo-titlebar__icon' />
          <span className='lingo-titlebar__title'>Lingo</span>
        </div>

        <div className='lingo-titlebar__drag-fill' data-tauri-drag-region />

        <div className='lingo-titlebar__controls'>
          <div className='lingo-titlebar__locale' ref={localeTriggerRef}>
            <button
              type='button'
              className={`lingo-titlebar__locale-trigger ${showLocaleMenu ? 'lingo-titlebar__locale-trigger--active' : ''}`}
              aria-label={t('locale.label')}
              title={t('locale.label')}
              onClick={() => setShowLocaleMenu((current) => !current)}>
              <Globe className='lingo-titlebar__locale-icon' aria-hidden='true' />
              <span className='lingo-titlebar__locale-label'>{currentLocaleLabel}</span>
              <ChevronRight
                className={`lingo-titlebar__locale-caret ${showLocaleMenu ? 'lingo-titlebar__locale-caret--open' : ''}`}
                aria-hidden='true'
              />
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
              className='lingo-titlebar__locale-menu'
            />
          </div>

          <button
            type='button'
            className='lingo-titlebar__btn'
            aria-label={t('titlebar.minimizeAria')}
            title={t('titlebar.minimizeTitle')}
            onClick={() => {
              void handleWindowAction('minimize');
            }}>
            <Minus className='lingo-titlebar__btn-icon lingo-titlebar__btn-minimize-icon' aria-hidden='true' />
          </button>
          <button
            type='button'
            className='lingo-titlebar__btn lingo-titlebar__btn--close'
            aria-label={t('titlebar.closeAria')}
            title={t('titlebar.closeTitle')}
            onClick={() => {
              void handleWindowAction('close');
            }}>
            <XClose className='lingo-titlebar__btn-icon lingo-titlebar__btn-close-icon' aria-hidden='true' />
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

      <div className='lingo-shell'>
        <aside className='lingo-shell__sidebar'>
          <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
        </aside>

        <section className='lingo-shell__workspace'>
          <div className='workspace-content'>{children}</div>
        </section>
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
