import { motion } from 'framer-motion';
import { ArrowRight, BookOpen } from '../icons';
import PageHeader from '../components/PageHeader';
import { useStore } from '../components/StoreProvider';
import { DEFAULT_GAME_SCENE, getGameSceneLabel } from '../constants/gameScenes';
import { getLanguageMeta } from '../constants/languages';
import { defaultTranslatorHotkeyLabel } from '../constants/hotkeys';
import { useI18n } from '../i18n/I18nProvider';

export default function Tutorial() {
  const { settings } = useStore();
  const { locale, t } = useI18n();

  const steps = [
    {
      id: '01',
      title: t('tutorial.guide.step1Title'),
      desc: t('tutorial.guide.step1Desc'),
    },
    {
      id: '02',
      title: t('tutorial.guide.step2Title'),
      desc: t('tutorial.guide.step2Desc'),
    },
    {
      id: '03',
      title: t('tutorial.guide.step3Title'),
      desc: t('tutorial.guide.step3Desc'),
    },
  ];

  const from = getLanguageMeta(settings?.translation_from || 'zh', locale);
  const to = getLanguageMeta(settings?.translation_to || 'en', locale);
  const scene = getGameSceneLabel(settings?.game_scene || DEFAULT_GAME_SCENE, locale);
  const modeKey = `translate.mode.${settings?.translation_mode || 'auto'}.title`;
  const modeLabel = t(modeKey) === modeKey ? t('translate.mode.auto.title') : t(modeKey);
  const hotkeyLabel = settings?.trans_hotkey?.shortcut || defaultTranslatorHotkeyLabel();

  return (
    <div className='page-stack tutorial-page'>
      <PageHeader
        eyebrow={t('sidebar.nav.tutorial')}
        title={t('tutorial.title')}
        summary={t('tutorial.summary')}
        icon={BookOpen}
        aside={
          <div className='page-header__badge-cluster'>
            <span className='tool-pill'>{t('tutorial.demo.badge')}</span>
          </div>
        }
      />

      <div className='tutorial-layout-grid'>
        <motion.section
          className='tutorial-layout-grid__guide tutorial-guide-panel tutorial-guide-panel--ops tool-rise'
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}>
          <div className='tutorial-ops-panel__head'>
            <div className='tutorial-ops-panel__copy'>
              <div className='workspace-section-label'>{t('tutorial.guide.title')}</div>
              <h2 className='workspace-section-title tutorial-ops-panel__title'>{t('tutorial.guide.title')}</h2>
              <p className='tool-body tutorial-ops-panel__summary'>{t('tutorial.guide.summary')}</p>
            </div>
            <div className='tutorial-ops-panel__meta'>
              <span className='tool-pill tool-pill--accent'>{`${from.label} -> ${to.label}`}</span>
              <span className='tool-pill'>{scene}</span>
            </div>
          </div>

          <div className='tutorial-step-grid tutorial-step-grid--ops'>
            {steps.map((step) => (
              <article key={step.id} className='tutorial-step tutorial-step--ops'>
                <div className='tutorial-step__index'>{step.id}</div>
                <div className='tutorial-step__copy'>
                  <h3 className='tool-card-title'>{step.title}</h3>
                  <p className='tool-body'>{step.desc}</p>
                </div>
              </article>
            ))}
          </div>

          <div className='tutorial-ops-panel__footer'>
            <span>{t('home.quick.summary')}</span>
            <span>{hotkeyLabel}</span>
          </div>
        </motion.section>

        <motion.section
          className='tutorial-layout-grid__demo tutorial-demo-panel tutorial-demo-panel--console tool-rise'
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <div className='tutorial-console__head'>
            <div className='tutorial-console__copy'>
              <div className='workspace-section-label'>{t('tutorial.demo.badge')}</div>
              <h2 className='workspace-section-title tutorial-console__title'>{t('tutorial.demo.title')}</h2>
              <p className='tool-body tutorial-console__summary'>{t('tutorial.demo.summary')}</p>
            </div>
            <div className='tutorial-console__pills'>
              <span className='tool-pill tool-pill--accent'>{`${from.label} -> ${to.label}`}</span>
              <span className='tool-pill'>{modeLabel}</span>
            </div>
          </div>

          <div className='tutorial-console'>
            <div className='tutorial-console__hud'>
              <div className='tutorial-console__signal'>
                <span className='tutorial-console__signal-dot' />
                <span className='tutorial-console__signal-label'>{t('home.live.signalOnline')}</span>
              </div>
              <div className='tutorial-console__meta'>
                <span>{scene}</span>
                <span>{hotkeyLabel}</span>
              </div>
            </div>

            <article className='tutorial-console__card'>
              <div className='tool-caption'>{t('tutorial.demo.sourceLabel')}</div>
              <div className='tutorial-console__text'>{t('tutorial.demo.sourceText')}</div>
            </article>

            <div className='tutorial-console__bridge'>
              <ArrowRight className='h-4 w-4' />
              <span>{t('tutorial.demo.resultBadge')}</span>
            </div>

            <article className='tutorial-console__card tutorial-console__card--result'>
              <div className='tool-caption'>{t('tutorial.demo.resultLabel')}</div>
              <div className='tutorial-console__text'>{t('tutorial.demo.resultText')}</div>
            </article>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
