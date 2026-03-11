import { Suspense, lazy, useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/home';

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
  return (
    <div className='dota-card flex h-full items-center justify-center p-6'>
      <span className='tool-body'>页面加载中...</span>
    </div>
  );
}

function App() {
  const [activeItem, setActiveItem] = useState('home');
  const CurrentPage = pages[activeItem] || Home;

  return (
    <div className='lingo-theme h-full text-zinc-900'>
      <Layout activeItem={activeItem} setActiveItem={setActiveItem}>
        <Suspense fallback={<PageFallback />}>
          <CurrentPage />
        </Suspense>
      </Layout>
    </div>
  );
}

export default App;
