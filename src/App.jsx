import { useState } from "react";
import Layout from "./components/Layout";
import Home from "./pages/home";
import Translate from "./pages/Translate";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Phrases from "./pages/Phrases";

const pages = {
  home: Home,
  translate: Translate,
  settings: Settings,
  about: About,
  phrases: Phrases
};

function App() {
  const [activeItem, setActiveItem] = useState("home");
  const CurrentPage = pages[activeItem];

  return (
    <div className="dota-theme min-h-screen text-zinc-900">
      <Layout activeItem={activeItem} setActiveItem={setActiveItem}>
        <CurrentPage />
      </Layout>
    </div>
  );
}

export default App;
