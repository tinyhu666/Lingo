import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import appIcon from '../assets/app-icon.png';
import { NAV_ITEMS } from '../constants/navigation';
import { APP_VERSION_LABEL } from '../constants/version';
import { useUpdater } from './UpdateProvider';

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();

  return (
    <div className='sidebar-panel'>
      <div className='sidebar-brand'>
        <div className='sidebar-brand__mark'>
          <img src={appIcon} alt='Lingo Logo' className='sidebar-brand__mark-image' />
        </div>
        <div className='sidebar-brand__text'>
          <h3 className='sidebar-brand__title sidebar-brand__title--compact'>Lingo</h3>
          <p className='sidebar-brand__subtitle'>游戏优化 · 自然表达</p>
        </div>
      </div>

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
        <div className='sidebar-footer__meta'>powerby 萌新</div>
      </div>
    </div>
  );
}
