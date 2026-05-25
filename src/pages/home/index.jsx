import { useI18n } from '../../i18n/I18nProvider';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import GameSceneCard from './components/GameSceneCard';
import EnableStatusCard from './components/EnableStatusCard';
import IncomingStatusCard from './components/IncomingStatusCard';

export default function Home() {
  // i18n is still used by the cards themselves; we keep the hook so the
  // tree subscribes to locale changes for re-render.
  useI18n();

  return (
    <div className='home-dashboard'>
      <div className='home-grid'>
        <div className='home-grid__stat home-grid__stat--incoming'>
          <IncomingStatusCard />
        </div>

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
    </div>
  );
}
