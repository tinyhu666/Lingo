import { useMemo, useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/home';
import TranslatePage from './pages/Translate';
import Settings from './pages/Settings';
import About from './pages/About';
import Phrases from './pages/Phrases';
import { NAV_ITEMS_BY_ID } from './constants/navigation';

const pages = {
  home: Home,
  translate: TranslatePage,
  settings: Settings,
  about: About,
  phrases: Phrases,
};

function App() {
  const [activeItem, setActiveItem] = useState('home');
  const CurrentPage = pages[activeItem] || Home;
  const pageMeta = useMemo(() => NAV_ITEMS_BY_ID[activeItem] || NAV_ITEMS_BY_ID.home, [activeItem]);

  return (
    <div className='lingo-theme min-h-screen text-zinc-900'>
      <Layout activeItem={activeItem} setActiveItem={setActiveItem} pageMeta={pageMeta}>
        <CurrentPage />
      </Layout>
    </div>
  );
}

export default App;
