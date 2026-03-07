import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './Sidebar';
import { StoreProvider } from './StoreProvider';
import { UpdateProvider } from './UpdateProvider';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

function LayoutShell({ children, activeItem, setActiveItem }) {
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
