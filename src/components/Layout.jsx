import { Toaster } from 'react-hot-toast';
import { useMemo } from 'react';
import { Sparkles } from '../icons';
import { StoreProvider, useStore } from './StoreProvider';
import { UpdateProvider, useUpdater } from './UpdateProvider';
import ServerRail from './ServerRail';
import Sidebar from './Sidebar';
import PageContextPanel from './PageContextPanel';

const PAGE_META = {
  home: {
    title: '战术控制台',
    subtitle: '管理翻译语言、快捷键与软件状态。',
  },
  translate: {
    title: '翻译模式',
    subtitle: '切换输出风格，匹配不同对局沟通节奏。',
  },
  phrases: {
    title: '常用语',
    subtitle: '维护常用短句与快捷键映射，快速发送关键指令。',
  },
  settings: {
    title: 'AI 模型',
    subtitle: '按厂商配置 API，并切换当前翻译模型。',
  },
  about: {
    title: '关于 AutoGG',
    subtitle: '查看版本信息并执行应用内更新。',
  },
};

function ShellLayout({ children, activeItem, setActiveItem }) {
  const { settings } = useStore();
  const { hasUpdate } = useUpdater();
  const meta = useMemo(() => PAGE_META[activeItem] || PAGE_META.home, [activeItem]);
  const modeLabelMap = {
    auto: '自动模式',
    pro: '职业模式',
    toxic: '竞技模式',
  };
  const modeLabel = modeLabelMap[settings?.translation_mode] || '自动模式';
  const enabled = settings?.app_enabled ?? true;

  return (
    <div className='ui-shell flex'>
      <Toaster
        toastOptions={{
          className: 'text-sm',
          style: {
            borderRadius: '12px',
            background: '#1f2634',
            color: '#e6eeff',
            border: '1px solid #39475f',
            boxShadow: '0 10px 28px rgba(2, 7, 16, 0.45)',
          },
        }}
      />

      <ServerRail activeItem={activeItem} setActiveItem={setActiveItem} />
      <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />

      <section className='ui-workspace'>
        <header className='ui-topbar'>
          <div className='min-w-0'>
            <h1 className='ui-card-title text-[21px] leading-tight'>{meta.title}</h1>
            <p className='ui-body mt-1 truncate'>{meta.subtitle}</p>
          </div>

          <div className='flex items-center gap-2'>
            <span className='ui-chip'>{modeLabel}</span>
            <span className={`ui-chip ${enabled ? 'ui-state-enabled' : 'ui-state-paused'}`}>
              {enabled ? '已启用' : '已暂停'}
            </span>
            {hasUpdate ? (
              <button
                type='button'
                onClick={() => setActiveItem('about')}
                className='ui-btn-primary !h-9 !px-3 !text-xs inline-flex items-center gap-1.5'>
                <Sparkles className='h-4 w-4' />
                可更新
              </button>
            ) : null}
          </div>
        </header>

        <div className='ui-workspace-body'>
          <main className='ui-main'>
            <div className='ui-main-scroll'>{children}</div>
          </main>

          <PageContextPanel activeItem={activeItem} setActiveItem={setActiveItem} />
        </div>
      </section>
    </div>
  );
}

export default function Layout({ children, activeItem, setActiveItem }) {
  return (
    <StoreProvider>
      <UpdateProvider>
        <ShellLayout activeItem={activeItem} setActiveItem={setActiveItem}>
          {children}
        </ShellLayout>
      </UpdateProvider>
    </StoreProvider>
  );
}
