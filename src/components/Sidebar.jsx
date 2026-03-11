import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import { NAV_ITEMS } from '../constants/navigation';
import { APP_VERSION_LABEL } from '../constants/version';
import { useUpdater } from './UpdateProvider';
import { useI18n } from '../i18n/I18nProvider';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  const { t } = useI18n();

  return (
    <div className='sidebar-panel'>
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
                  <span className='sidebar-nav__badge'>{t('sidebar.updateAvailable')}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className='sidebar-footer'>
        <div className='sidebar-footer__version'>{APP_VERSION_LABEL}</div>
        <div className='sidebar-footer__meta'>{t('common.poweredBy')}</div>
      </div>
    </div>
  );
}
