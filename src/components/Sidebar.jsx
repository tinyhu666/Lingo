import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import { HomeHLine, Settings02, Translate, ChatBubbleMessage, InfoCircle } from '../icons';
import appIcon from '../assets/app-icon.png';
import { useUpdater } from './UpdateProvider';

const NAV_GROUPS = [
  {
    label: '主控',
    items: [
      { id: 'home', name: '主页', icon: HomeHLine },
      { id: 'translate', name: '模式', icon: Translate },
      { id: 'phrases', name: '常用语', icon: ChatBubbleMessage },
      { id: 'settings', name: 'AI 模型', icon: Settings02 },
    ],
  },
  {
    label: '系统',
    items: [{ id: 'about', name: '关于', icon: InfoCircle }],
  },
];

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();

  return (
    <aside className='ui-nav-panel'>
      <div className='px-4 py-4 border-b border-[#2a3242]'>
        <button
          type='button'
          className='w-full rounded-2xl border border-[#34415b] bg-[#1b2333] px-3 py-3 flex items-center gap-3 hover:border-[#4a5e85] transition-colors'
          onClick={() => setActiveItem('home')}>
          <img src={appIcon} alt='AutoGG' className='h-11 w-11 rounded-xl object-cover border border-[#415171]' />
          <div className='text-left min-w-0'>
            <div className='dota-logo-title text-[28px] leading-none'>AutoGG</div>
            <div className='ui-caption mt-1'>Dota2 沟通翻译控制台</div>
          </div>
        </button>
      </div>

      <nav className='flex-1 overflow-auto px-3 py-4 space-y-4'>
        {NAV_GROUPS.map((group) => (
          <section key={group.label} className='space-y-2'>
            <div className='px-2 ui-caption tracking-[0.1em] uppercase'>{group.label}</div>
            <div className='space-y-1'>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeItem === item.id;
                return (
                  <button
                    key={item.id}
                    type='button'
                    className={twMerge('ui-nav-item w-full justify-between', isActive && 'ui-nav-item-active')}
                    onClick={() => setActiveItem(item.id)}>
                    {isActive ? <span className='ui-nav-dot' /> : null}
                    <span className='flex min-w-0 items-center gap-3 pl-1'>
                      <Icon className='h-[18px] w-[18px] shrink-0' />
                      <span className='truncate'>{item.name}</span>
                    </span>
                    {item.id === 'about' && hasUpdate ? (
                      <span className='ml-2 rounded-full bg-[#ff5d6c] px-2.5 py-0.5 text-[11px] font-semibold leading-none text-white'>
                        可更新
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className='border-t border-[#2a3242] px-4 py-3'>
        <motion.div
          className='ui-soft-card px-3 py-2'
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}>
          <div className='ui-caption'>版本</div>
          <div className='ui-control-text mt-1'>V1.2.0</div>
          <div className='ui-caption mt-1'>powerby 萌新</div>
        </motion.div>
      </div>
    </aside>
  );
}
