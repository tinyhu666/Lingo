import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import GameSceneCard from './components/GameSceneCard';
import EnableStatusCard from './components/EnableStatusCard';

export default function Home() {
  return (
    <div className='home-grid'>
      <div className='home-grid__stat home-grid__stat--translation'>
        <TranslationDirectionCard />
      </div>

      <div className='home-grid__stat home-grid__stat--status'>
        <EnableStatusCard />
      </div>

      <div className='home-grid__stat home-grid__stat--game'>
        <GameSceneCard />
      </div>

      <div className='home-grid__stat home-grid__stat--hotkey'>
        <HotkeyCard />
      </div>
    </div>
  );
}
