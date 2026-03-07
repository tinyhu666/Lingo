import { useEffect, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './Sidebar';
import { StoreProvider, useStore } from './StoreProvider';
import { UpdateProvider, useUpdater } from './UpdateProvider';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

function LayoutShell({ children, activeItem, setActiveItem, pageMeta }) {
  const { settings } = useStore();
  const { hasUpdate } = useUpdater();

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let unlisten = null;

    const bind = async () => {
      unlisten = await listen('translation_failed', (event) => {
        const message =
          typeof event.payload === 'string' && event.payload.trim()
            ? event.payload
            : '翻译失败，请检查服务配置或稍后重试。';
        showError(message);
      });
    };

    void bind();

    return () => {
      if (typeof unlisten === 'function') {
        unlisten();
      }
    };
  }, []);

  const statusPills = useMemo(() => {
    const items = [];

    if (settings?.app_enabled === false) {
      items.push({ label: '软件已暂停', tone: 'muted' });
    } else {
      items.push({ label: '服务已启用', tone: 'success' });
    }

    if (hasUpdate) {
      items.push({ label: '检测到更新', tone: 'alert' });
    }

    return items;
  }, [hasUpdate, settings?.app_enabled]);

  const HeaderIcon = pageMeta?.icon;

  return (
    <div className='lingo-app-shell'>
      <Toaster
        toastOptions={{
          className: 'text-sm',
          style: {
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.94)',
            color: '#1f2937',
            border: '1px solid rgba(212,220,232,0.88)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
            backdropFilter: 'blur(18px)',
          },
        }}
      />

      <div className='lingo-shell'>
        <aside className='lingo-shell__sidebar'>
          <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
        </aside>

        <section className='lingo-shell__workspace'>
          <header className='workspace-header'>
            <div className='workspace-header__left'>
              <div className='workspace-header__icon'>
                {HeaderIcon ? <HeaderIcon className='h-5 w-5 stroke-current' /> : null}
              </div>
              <div className='workspace-header__text'>
                <span className='workspace-header__eyebrow'>{pageMeta?.eyebrow || 'Workspace'}</span>
                <h1 className='workspace-header__title'>{pageMeta?.title || 'Lingo'}</h1>
                <p className='workspace-header__subtitle'>{pageMeta?.subtitle || '统一管理翻译客户端设置和状态。'}</p>
              </div>
            </div>

            <div className='workspace-header__right'>
              {statusPills.map((item) => (
                <span key={item.label} className={`workspace-pill workspace-pill--${item.tone}`}>
                  {item.label}
                </span>
              ))}
            </div>
          </header>

          <div className='workspace-content'>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Layout({ children, activeItem, setActiveItem, pageMeta }) {
  return (
    <StoreProvider>
      <UpdateProvider>
        <LayoutShell activeItem={activeItem} setActiveItem={setActiveItem} pageMeta={pageMeta}>
          {children}
        </LayoutShell>
      </UpdateProvider>
    </StoreProvider>
  );
}
