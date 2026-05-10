import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import { listen } from '@tauri-apps/api/event';
import Home from './pages/home';
import { useI18n } from './i18n/I18nProvider';
import { hasTauriRuntime } from './services/tauriRuntime';
import { getDesktopPlatform } from './utils/platform';

const TranslatePage = lazy(() => import('./pages/Translate'));
const TutorialPage = lazy(() => import('./pages/Tutorial'));
const AboutPage = lazy(() => import('./pages/About'));
const PhrasesPage = lazy(() => import('./pages/Phrases'));

const pages = {
  home: Home,
  translate: TranslatePage,
  tutorial: TutorialPage,
  phrases: PhrasesPage,
  about: AboutPage,
};

function PageFallback() {
  const { t } = useI18n();

  return (
    <div className='dota-card flex h-full items-center justify-center p-6'>
      <span className='tool-body'>{t('app.pageLoading')}</span>
    </div>
  );
}

function App() {
  const [activeItem, setActiveItem] = useState('home');
  const CurrentPage = pages[activeItem] || Home;
  const desktopPlatform = useMemo(() => getDesktopPlatform(), []);
  const windowsClient = desktopPlatform === 'windows';
  const desktopClient = Boolean(desktopPlatform);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const html = document.documentElement;
    const body = document.body;

    if (desktopClient) {
      html.classList.add('platform-desktop');
      body.classList.add('platform-desktop');
    }

    if (desktopPlatform === 'windows') {
      html.classList.add('platform-windows');
      body.classList.add('platform-windows');
    }

    if (desktopPlatform === 'macos') {
      html.classList.add('platform-macos');
      body.classList.add('platform-macos');
    }

    return () => {
      html.classList.remove('platform-desktop');
      body.classList.remove('platform-desktop');
      html.classList.remove('platform-windows');
      body.classList.remove('platform-windows');
      html.classList.remove('platform-macos');
      body.classList.remove('platform-macos');
    };
  }, [desktopClient, desktopPlatform]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let unlisten = null;

    const bind = async () => {
      try {
        const cleanup = await listen('tray_check_update', () => {
          if (!disposed) {
            setActiveItem('about');
          }
        });
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      } catch (error) {
        console.error('Failed to bind tray update navigation', error);
      }
    };

    void bind();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div
      className={`lingo-theme h-full text-zinc-900 ${desktopClient ? 'lingo-theme--desktop' : ''} ${windowsClient ? 'lingo-theme--windows' : ''}`}>
      <Layout activeItem={activeItem} setActiveItem={setActiveItem}>
        <Suspense fallback={<PageFallback />}>
          <CurrentPage />
        </Suspense>
      </Layout>
    </div>
  );
}

export default App;
