import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import { NAV_ITEMS } from '../constants/navigation';
import { APP_VERSION_LABEL } from '../constants/version';
import { useUpdater } from './UpdateProvider';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();

  return (
    <div className='sidebar-panel'>
      <div className='sidebar-section'>
        <div className='sidebar-section__label'>导航</div>
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
                <span className='sidebar-nav__text'>{item.name}</span>

                {item.id === 'about' && hasUpdate ? (
                  <span className='sidebar-nav__badge'>可更新</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className='sidebar-footer'>
        <div className='sidebar-footer__version'>{APP_VERSION_LABEL}</div>
        <div className='sidebar-footer__meta'>Powered by 萌新</div>
      </div>
    </div>
  );
}
