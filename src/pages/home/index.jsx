import { ArrowRight, Sparkles } from '../../icons';
import { useI18n } from '../../i18n/I18nProvider';
import StatusChip from '../../components/StatusChip';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import GameSceneCard from './components/GameSceneCard';
import EnableStatusCard from './components/EnableStatusCard';

export default function Home() {
  const { t } = useI18n();
  const steps = [
    t('home.guide.step1Title'),
    t('home.guide.step2Title'),
    t('home.guide.step3Title'),
  ];

  return (
    <div className='home-dashboard'>
      <section className='home-brief dota-card'>
        <div className='home-brief__intro'>
          <div className='home-brief__eyebrow'>
            <Sparkles className='home-brief__eyebrow-icon' />
            <span>{t('common.appName')}</span>
          </div>
          <h1 className='home-brief__title'>{t('common.appName')}</h1>
          <p className='home-brief__summary'>{t('home.guide.summary')}</p>
          <div className='home-brief__steps'>
            {steps.map((step) => (
              <StatusChip key={step} label={step} tone='neutral' className='home-brief__step' />
            ))}
          </div>
        </div>

        <div className='home-brief__flow'>
          <div className='home-brief__flow-label'>{t('home.demo.title')}</div>
          <div className='home-brief__flow-grid'>
            <article className='home-brief__bubble'>
              <span className='home-brief__bubble-label'>{t('home.demo.sourceLabel')}</span>
              <p className='home-brief__bubble-copy'>{t('home.demo.sourceText')}</p>
            </article>

            <div className='home-brief__flow-arrow' aria-hidden='true'>
              <ArrowRight className='home-brief__flow-arrow-icon' />
            </div>

            <article className='home-brief__bubble home-brief__bubble--accent'>
              <span className='home-brief__bubble-label'>{t('home.demo.resultLabel')}</span>
              <p className='home-brief__bubble-copy'>{t('home.demo.resultText')}</p>
            </article>
          </div>
        </div>
      </section>

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
    </div>
  );
}
