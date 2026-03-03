import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import {
  HomeHLine,
  Settings02,
  Translate,
  ChatBubbleMessage,
  AT,
} from '../icons';
import appIcon from '../assets/app-icon.png';
import { useUpdater } from './UpdateProvider';
// import LoginModal from './LoginModal';

const sidebarItems = [
  { name: '主页', icon: HomeHLine, id: 'home' },
  { name: '模式', icon: Translate, id: 'translate' },
  { name: '常用语', icon: ChatBubbleMessage, id: 'phrases' },
  { name: 'AI模型', icon: Settings02, id: 'settings' },
  { name: '关于', icon: AT, id: 'about' },
];

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  // const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  return (
    <div className='dota-sidebar h-full flex flex-col'>
      {/* Logo区域 */}
      <div className='px-5 py-5 border-b border-zinc-200/60'>
        <div className='flex items-center space-x-3'>
          <div className='rounded-xl flex items-center justify-center overflow-hidden w-[46px] h-[46px] min-w-[46px] border border-zinc-200'>
            <img
              src={appIcon}
              alt='AutoGG Logo'
              width='46'
              height='46'
              className='object-cover w-[46px] h-[46px]'
            />
          </div>
          <h3 className='dota-logo-title text-[21px] font-semibold'>AutoGG</h3>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className='flex-1 px-2 py-3'>
        {sidebarItems.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <div
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className='relative'>
              {isActive && (
                <motion.div
                  layoutId='activeTab'
                  className='absolute inset-0 rounded-xl'
                  style={{
                    background:
                      'linear-gradient(105deg, rgba(37,99,235,0.18), rgba(59,130,246,0.08))',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(30, 64, 175, 0.1)',
                  }}
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <div
                className={twMerge(
                  'flex items-center justify-between px-3.5 py-2.5 cursor-pointer rounded-xl',
                  'text-[14px] font-medium relative z-10',
                  isActive
                    ? 'text-zinc-900 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/80'
                )}>
                <div className='flex items-center min-w-0'>
                  <item.icon
                    className={twMerge(
                      'w-[18px] h-[18px] mr-3',
                      isActive ? 'stroke-zinc-900' : 'stroke-zinc-500'
                    )}
                  />
                  <span>{item.name}</span>
                </div>
                {item.id === 'about' && hasUpdate ? (
                  <span className='ml-2 whitespace-nowrap rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-semibold leading-none text-white'>
                    可更新
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </nav>

      <div className='px-4 pb-4 pt-2 border-t border-zinc-200/70'>
        <div className='text-[12px] text-zinc-500 leading-relaxed'>
          <div className='font-semibold text-zinc-600'>V0.1.6</div>
          <div>powerby 萌新</div>
        </div>
      </div>

      {/* 用户信息 */}
      {/* <div className='px-2 pb-3'>
        <div
          className='flex items-center px-3.5 py-2.5 cursor-pointer text-[#666666] hover:text-[#1a1a1a]'
          onClick={() => setIsLoginModalOpen(true)}>
          <UserUser01 className='w-[18px] h-[18px] mr-3 stroke-[#666666]' />
          <span className='text-[14px] font-medium'>未登录</span>
        </div>
      </div> */}

      {/* <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      /> */}
    </div>
  );
}
