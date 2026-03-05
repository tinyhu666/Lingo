import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import {
  HomeHLine,
  Settings02,
  Translate,
  ChatBubbleMessage,
  AT,
  UserUser01,
} from '../icons';
import appIcon from '../assets/app-icon.png';
import { useUpdater } from './UpdateProvider';
import { useAuth } from './AuthProvider';

const sidebarItems = [
  { name: '主页', icon: HomeHLine, id: 'home' },
  { name: '模式', icon: Translate, id: 'translate' },
  { name: '常用语', icon: ChatBubbleMessage, id: 'phrases' },
  { name: '服务', icon: Settings02, id: 'settings' },
  { name: '关于', icon: AT, id: 'about' },
];

export default function Sidebar({ activeItem, setActiveItem }) {
  const { hasUpdate } = useUpdater();
  const {
    authState,
    openAuthModal,
    signOut,
    resendEmailVerification,
    configured,
    actionLoading,
  } = useAuth();

  return (
    <div className='dota-sidebar h-full flex flex-col'>
      {/* Logo区域 */}
      <div className='px-5 py-5 border-b border-zinc-200/60'>
        <div className='flex items-center space-x-3'>
          <div className='rounded-xl flex items-center justify-center overflow-hidden w-[46px] h-[46px] min-w-[46px] border border-zinc-200'>
            <img
              src={appIcon}
              alt='Lingo Logo'
              width='46'
              height='46'
              className='object-cover w-[46px] h-[46px]'
            />
          </div>
          <h3 className='dota-logo-title text-[21px] font-semibold'>Lingo</h3>
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
                  'text-sm font-medium relative z-10',
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

      <div className='px-4 py-3 border-t border-zinc-200/70'>
        <div className='rounded-xl border border-zinc-200 bg-white/70 p-3'>
          <div className='flex items-center gap-2'>
            <UserUser01 className='h-4 w-4 text-zinc-500' />
            <span className='text-sm font-semibold text-zinc-700'>
              {authState.loggedIn ? '已登录' : '未登录'}
            </span>
          </div>
          <div className='mt-1 text-xs text-zinc-500 truncate'>
            {authState.loggedIn ? authState.email : '登录后可启用翻译'}
          </div>
          {authState.loggedIn && !authState.emailVerified ? (
            <div className='mt-1 text-[11px] text-amber-600'>邮箱未验证，翻译功能暂不可用。</div>
          ) : null}
          {!configured ? (
            <div className='mt-1 text-[11px] text-red-500'>认证服务未配置。</div>
          ) : null}

          <div className='mt-2 flex gap-2'>
            {authState.loggedIn ? (
              <>
                {!authState.emailVerified ? (
                  <button
                    type='button'
                    onClick={() => resendEmailVerification()}
                    disabled={actionLoading}
                    className='tool-btn px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed'>
                    重发验证
                  </button>
                ) : null}
                <button
                  type='button'
                  onClick={() => signOut()}
                  disabled={actionLoading}
                  className='tool-btn px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed'>
                  退出
                </button>
              </>
            ) : (
              <button
                type='button'
                onClick={() => openAuthModal('login')}
                className='tool-btn-primary px-2.5 py-1.5 text-xs'>
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      </div>

      <div className='px-4 pb-4 pt-2 border-t border-zinc-200/70'>
        <div className='tool-caption'>
          <div className='font-semibold text-zinc-600'>V0.2.1</div>
          <div className='mt-0.5'>powerby 萌新</div>
        </div>
      </div>
    </div>
  );
}
