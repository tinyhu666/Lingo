import { NAV_ITEMS } from '../constants/navigation';
import { APP_VERSION_LABEL } from '../constants/version';
import { useUpdater } from './UpdateProvider';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from './StoreProvider';
import appIcon from '../assets/app-icon.png';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  const { settings } = useStore();
  const { t } = useI18n();
  const isEnabled = settings?.app_enabled ?? true;

  return (
    <aside className='lg-sidebar'>
      <div className='lg-side-brand' aria-label={t('common.appName')}>
        <div
          className='lg-side-brand__icon'
          style={{ background: 'transparent', boxShadow: 'none' }}>
          <img src={appIcon} alt='Lingo' style={{ width: 28, height: 28 }} />
        </div>
        <div>
          <div className='lg-side-brand__name'>{t('common.appName')}</div>
          <div className='lg-side-brand__ver'>{APP_VERSION_LABEL}</div>
        </div>
      </div>

      <div className='lg-side-eyebrow'>{t('sidebar.controlDeck')}</div>
      <nav className='lg-nav'>
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type='button'
              onClick={() => setActiveItem(item.id)}
              className={`lg-nav__item ${isActive ? 'lg-nav__item--active' : ''}`}>
              <span className='lg-nav__icon'>
                <Icon />
              </span>
              <span className='lg-nav__text'>{t(item.labelKey)}</span>
              {item.id === 'about' && hasUpdate ? (
                <span className='lg-chip lg-chip--warn-strong lg-nav__badge'>
                  {t('sidebar.updateBadge')}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className='lg-side-status'>
        <span
          className={`lg-side-status__dot ${isEnabled ? '' : 'lg-side-status__dot--paused'}`}
          aria-hidden='true'
        />
        <div className='lg-side-status__copy'>
          <div className='lg-side-status__title'>
            {isEnabled ? t('sidebar.serviceRunning') : t('sidebar.servicePaused')}
          </div>
          <div className='lg-side-status__meta'>{t('sidebar.hotkeyReady')}</div>
        </div>
        <span className={`lg-chip ${isEnabled ? 'lg-chip--success' : 'lg-chip--warn'}`}>
          {isEnabled ? t('common.enabled') : t('common.paused')}
        </span>
      </div>
    </aside>
  );
}
