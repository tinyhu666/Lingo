import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NAV_ITEMS } from '../constants/navigation';
import { useUpdater } from './UpdateProvider';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from './StoreProvider';
import { useTheme } from './ThemeProvider';
import { Kbd } from './lg';
import { hotkeyLabelsFromSettings } from '../constants/hotkeys';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  const { settings } = useStore();
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const isEnabled = settings?.app_enabled ?? true;
  const itemRefs = useRef({});
  const [indicatorY, setIndicatorY] = useState(0);

  useLayoutEffect(() => {
    const node = itemRefs.current[activeItem];
    if (node) {
      setIndicatorY(node.offsetTop);
    }
  }, [activeItem]);

  const hotkeyKeys = useMemo(() => hotkeyLabelsFromSettings(settings), [settings]);

  return (
    <aside className='lg-sidebar'>
      <div className='lg-side-eyebrow'>{t('sidebar.controlDeck')}</div>
      <nav className='lg-nav'>
        <div
          className='lg-nav__indicator'
          style={{ transform: `translateY(${indicatorY}px)` }}
          aria-hidden='true'
        />
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type='button'
              ref={(node) => {
                itemRefs.current[item.id] = node;
              }}
              onClick={() => setActiveItem(item.id)}
              className={`lg-nav__item ${isActive ? 'lg-nav__item--active' : ''}`}>
              <span className='lg-nav__icon'>
                <Icon />
              </span>
              <span className='lg-nav__text'>{t(item.labelKey)}</span>
              {item.id === 'about' && hasUpdate ? (
                <span className='lg-chip lg-chip--warn lg-chip--hud lg-nav__badge'>
                  {t('sidebar.updateBadge')}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <footer className='lg-side-footer'>
        <div className='lg-side-status'>
          <div className='lg-side-status__row'>
            <span className={`lg-live ${isEnabled ? '' : 'lg-live--paused'}`} aria-hidden='true' />
            <span>{isEnabled ? t('sidebar.serviceRunning') : t('sidebar.servicePaused')}</span>
          </div>
          <div className='lg-side-status__sub'>
            <span className='lg-side-status__label'>{t('home.hotkey.title')}</span>
            <Kbd keys={hotkeyKeys} size='sm' />
          </div>
        </div>
        <div className='lg-theme-switch' role='group' aria-label={t('sidebar.theme.label')}>
          <button
            type='button'
            className={theme !== 'light' ? 'is-on' : ''}
            aria-pressed={theme !== 'light'}
            onClick={() => setTheme('dark')}>
            {t('sidebar.theme.dark')}
          </button>
          <button
            type='button'
            className={theme === 'light' ? 'is-on' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}>
            {t('sidebar.theme.light')}
          </button>
        </div>
      </footer>
    </aside>
  );
}
