import { useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/home';
import TranslatePage from './pages/Translate';
import About from './pages/About';
import Phrases from './pages/Phrases';

const pages = {
  home: Home,
  translate: TranslatePage,
  about: About,
  phrases: Phrases,
};

function App() {
  const [activeItem, setActiveItem] = useState('home');
  const CurrentPage = pages[activeItem] || Home;

  return (
    <div className='lingo-theme min-h-screen text-zinc-900'>
      <Layout activeItem={activeItem} setActiveItem={setActiveItem}>
        <CurrentPage />
      </Layout>
    </div>
  );
}

export default App;
