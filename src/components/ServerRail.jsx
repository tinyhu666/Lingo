import {
  HomeHLine,
  Translate,
  ChatBubbleMessage,
  Settings02,
  InfoCircle,
} from '../icons';
import appIcon from '../assets/app-icon.png';
import { useStore } from './StoreProvider';
import { useUpdater } from './UpdateProvider';

const RAIL_ITEMS = [
  { id: 'home', icon: HomeHLine, label: '主页' },
  { id: 'translate', icon: Translate, label: '模式' },
  { id: 'phrases', icon: ChatBubbleMessage, label: '常用语' },
  { id: 'settings', icon: Settings02, label: '模型' },
  { id: 'about', icon: InfoCircle, label: '关于' },
];

export default function ServerRail({ activeItem, setActiveItem }) {
  const { settings } = useStore();
  const { hasUpdate } = useUpdater();
  const appEnabled = settings?.app_enabled ?? true;

  return (
    <aside className='ui-server-rail'>
      <button
        type='button'
        title='AutoGG'
        onClick={() => setActiveItem('home')}
        className='relative h-12 w-12 rounded-2xl border border-[#3e4c67] bg-[#1f2a40] p-[3px] shadow-[0_8px_18px_rgba(8,12,20,0.4)]'>
        <img src={appIcon} alt='AutoGG' className='h-full w-full rounded-xl object-cover' />
      </button>

      <div className='ui-section-divider w-9' />

      <div className='flex flex-col items-center gap-2'>
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeItem === item.id;

          return (
            <button
              key={item.id}
              type='button'
              title={item.label}
              onClick={() => setActiveItem(item.id)}
              className={`relative h-11 w-11 rounded-xl border transition-all ${
                active
                  ? 'border-[#6a8cff] bg-[#2f3f68] shadow-[0_0_0_1px_rgba(109,131,255,0.45)]'
                  : 'border-[#36425b] bg-[#1a2233] hover:border-[#4f6289] hover:bg-[#24304a]'
              }`}>
              <Icon className={`m-auto h-[19px] w-[19px] ${active ? 'text-[#e9efff]' : 'text-[#9aa8c4]'}`} />
              {item.id === 'about' && hasUpdate ? (
                <span className='absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[#10141e] bg-[#ff5d6c]' />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className='mt-auto flex flex-col items-center gap-2 pb-1'>
        <span
          title={appEnabled ? '软件状态：启用' : '软件状态：暂停'}
          className={`h-2.5 w-2.5 rounded-full ${
            appEnabled ? 'bg-emerald-400 shadow-[0_0_12px_rgba(66,211,146,0.8)]' : 'bg-zinc-500'
          }`}
        />
        <span className='ui-caption text-[10px] tracking-[0.08em]'>LIVE</span>
      </div>
    </aside>
  );
}
