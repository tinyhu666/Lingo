import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './Sidebar';
import { StoreProvider } from './StoreProvider';
import { UpdateProvider } from './UpdateProvider';
import appIcon from '../assets/app-icon.png';
import { XClose } from '../icons';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

async function handleWindowAction(action) {
  if (!hasTauriRuntime()) {
    return;
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();

    if (action === 'minimize') {
      await appWindow.minimize();
      return;
    }

    if (action === 'close') {
      await appWindow.close();
    }
  } catch (error) {
    console.error('Window action failed', { action, error });
    showError(action === 'minimize' ? '最小化失败，请重试' : '窗口操作失败，请重试');
  }
}

function LayoutShell({ children, activeItem, setActiveItem }) {
  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let cleanup = null;

    const bind = async () => {
      try {
        const unlisten = await listen('translation_failed', (event) => {
          const message =
            typeof event.payload === 'string' && event.payload.trim()
              ? event.payload
              : '翻译失败，请检查服务配置或稍后重试。';
          showError(message);
        });

        if (disposed) {
          unlisten();
          return;
        }

        cleanup = unlisten;
      } catch (error) {
        console.error('Failed to bind translation_failed listener', error);
      }
    };

    void bind();

    return () => {
      disposed = true;
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []);

  return (
    <div className='lingo-app-shell'>
      <header className='lingo-titlebar'>
        <div className='lingo-titlebar__brand' data-tauri-drag-region>
          <img src={appIcon} alt='Lingo' className='lingo-titlebar__icon' />
          <span className='lingo-titlebar__title'>Lingo</span>
        </div>

        <div className='lingo-titlebar__drag-fill' data-tauri-drag-region />

        <div className='lingo-titlebar__controls'>
          <button
            type='button'
            className='lingo-titlebar__btn'
            aria-label='最小化窗口'
            title='最小化'
            onClick={() => {
              void handleWindowAction('minimize');
            }}>
            <span className='lingo-titlebar__btn-minimize' aria-hidden='true' />
          </button>
          <button
            type='button'
            className='lingo-titlebar__btn lingo-titlebar__btn--close'
            aria-label='关闭窗口'
            title='关闭'
            onClick={() => {
              void handleWindowAction('close');
            }}>
            <XClose className='lingo-titlebar__btn-close-icon' aria-hidden='true' />
          </button>
        </div>
      </header>

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
          <div className='workspace-content'>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Layout({ children, activeItem, setActiveItem }) {
  return (
    <StoreProvider>
      <UpdateProvider>
        <LayoutShell activeItem={activeItem} setActiveItem={setActiveItem}>
          {children}
        </LayoutShell>
      </UpdateProvider>
    </StoreProvider>
  );
}
