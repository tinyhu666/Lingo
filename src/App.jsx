import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/home';
import { useI18n } from './i18n/I18nProvider';
import { isWindowsClient } from './utils/platform';

const TranslatePage = lazy(() => import('./pages/Translate'));
const AboutPage = lazy(() => import('./pages/About'));
const PhrasesPage = lazy(() => import('./pages/Phrases'));

const pages = {
  home: Home,
  translate: TranslatePage,
  about: AboutPage,
  phrases: PhrasesPage,
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
  const windowsClient = useMemo(() => isWindowsClient(), []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const html = document.documentElement;
    const body = document.body;

    if (windowsClient) {
      html.classList.add('platform-windows');
      body.classList.add('platform-windows');
    }

    return () => {
      html.classList.remove('platform-windows');
      body.classList.remove('platform-windows');
    };
  }, [windowsClient]);

  return (
    <div className={`lingo-theme h-full text-zinc-900 ${windowsClient ? 'lingo-theme--windows' : ''}`}>
      <Layout activeItem={activeItem} setActiveItem={setActiveItem}>
        <Suspense fallback={<PageFallback />}>
          <CurrentPage />
        </Suspense>
      </Layout>
    </div>
  );
}

export default App;
