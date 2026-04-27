import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import { NAV_ITEMS } from '../constants/navigation';
import { APP_VERSION_LABEL } from '../constants/version';
import { useUpdater } from './UpdateProvider';
import { useI18n } from '../i18n/I18nProvider';
import StatusChip from './StatusChip';
import { useStore } from './StoreProvider';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  const { settings } = useStore();
  const { t } = useI18n();
  const isEnabled = settings?.app_enabled ?? true;

  return (
    <div className='sidebar-panel'>
      <div className='sidebar-brand' aria-label={t('common.appName')}>
        <div>
          <div className='sidebar-brand__eyebrow'>{t('sidebar.controlDeck')}</div>
          <div className='sidebar-brand__name'>{t('common.appName')}</div>
        </div>
        <div className='sidebar-brand__version'>{APP_VERSION_LABEL}</div>
      </div>

      <div className='sidebar-section'>
        <nav className='sidebar-nav'>
          {NAV_ITEMS.map((item) => {
            const isActive = activeItem === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type='button'
                onClick={() => setActiveItem(item.id)}
                className={twMerge('sidebar-nav__item', isActive && 'sidebar-nav__item--active')}>
                {isActive ? (
                  <motion.span
                    layoutId='sidebar-active-pill'
                    className='sidebar-nav__active-glow'
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  />
                ) : null}

                <span className='sidebar-nav__icon-wrap'>
                  <Icon className='sidebar-nav__icon' />
                </span>
                <span className='sidebar-nav__text'>{t(item.labelKey)}</span>

                {item.id === 'about' && hasUpdate ? (
                  <StatusChip label={t('sidebar.updateAvailable')} tone='warning' className='sidebar-nav__badge' />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className='sidebar-status-card'>
        <span
          className={`sidebar-status-card__dot ${
            isEnabled ? 'sidebar-status-card__dot--enabled' : 'sidebar-status-card__dot--paused'
          }`}
          aria-hidden='true'
        />
        <div className='sidebar-status-card__copy'>
          <div className='sidebar-status-card__title'>
            {isEnabled ? t('sidebar.serviceRunning') : t('sidebar.servicePaused')}
          </div>
          <div className='sidebar-status-card__meta'>{t('sidebar.hotkeyReady')}</div>
        </div>
        <StatusChip label={isEnabled ? t('common.enabled') : t('common.paused')} tone={isEnabled ? 'success' : 'warning'} />
      </div>

      <div className='sidebar-footer'>
        <div className='sidebar-footer__version'>{APP_VERSION_LABEL}</div>
        <div className='sidebar-footer__meta'>{t('common.poweredBy')}</div>
      </div>
    </div>
  );
}
