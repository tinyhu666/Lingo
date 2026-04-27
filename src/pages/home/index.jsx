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
    {
      id: '01',
      title: t('home.guide.step1Title'),
      desc: t('home.guide.step1Desc'),
    },
    {
      id: '02',
      title: t('home.guide.step2Title'),
      desc: t('home.guide.step2Desc'),
    },
    {
      id: '03',
      title: t('home.guide.step3Title'),
      desc: t('home.guide.step3Desc'),
    },
  ];

  return (
    <div className='home-dashboard'>
      <section className='home-brief dota-card'>
        <article className='home-brief__hero'>
          <div className='home-brief__eyebrow'>
            <Sparkles className='home-brief__eyebrow-icon' />
            <span>{t('common.appName')}</span>
          </div>
          <h1 className='home-brief__title'>{t('common.appName')}</h1>
          <p className='home-brief__summary'>{t('home.guide.summary')}</p>
          <div className='home-brief__quick-row'>
            <StatusChip label={t('home.translationLanguage.title')} tone='info' className='home-brief__step' />
            <StatusChip label={t('home.gameScene.title')} tone='neutral' className='home-brief__step' />
            <StatusChip label={t('home.hotkey.title')} tone='neutral' className='home-brief__step' />
          </div>
        </article>

        <article className='home-brief__flow'>
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
        </article>
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

      <section className='home-guide-strip dota-card'>
        <div className='home-guide-strip__head'>
          <span className='tool-caption'>{t('home.guide.title')}</span>
          <p className='home-guide-strip__lead'>{t('home.demo.summary')}</p>
        </div>

        <div className='home-guide-strip__steps'>
          {steps.map((step) => (
            <article key={step.id} className='home-guide-step tool-rise'>
              <span className='home-guide-step__number'>{step.id}</span>
              <div>
                <h2 className='tool-card-title'>{step.title}</h2>
                <p className='tool-body'>{step.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
