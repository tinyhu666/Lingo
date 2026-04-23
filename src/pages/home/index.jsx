import { ArrowRight } from '../../icons';
import { useStore } from '../../components/StoreProvider';
import { DEFAULT_GAME_SCENE, getGameSceneLabel } from '../../constants/gameScenes';
import { getLanguageMeta } from '../../constants/languages';
import { defaultTranslatorHotkeyLabel } from '../../constants/hotkeys';
import { useI18n } from '../../i18n/I18nProvider';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import GameSceneCard from './components/GameSceneCard';
import EnableStatusCard from './components/EnableStatusCard';

function QuickFlowStep({ index, title, desc }) {
  return (
    <article className='home-quick-step'>
      <div className='home-quick-step__index'>{index}</div>
      <div className='home-quick-step__body'>
        <h3 className='tool-card-title'>{title}</h3>
        <p className='tool-body'>{desc}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const { settings } = useStore();
  const { locale, t } = useI18n();

  const from = getLanguageMeta(settings?.translation_from || 'zh', locale).label;
  const to = getLanguageMeta(settings?.translation_to || 'en', locale).label;
  const enabled = settings?.app_enabled !== false;
  const scene = getGameSceneLabel(settings?.game_scene || DEFAULT_GAME_SCENE, locale);
  const modeKey = `translate.mode.${settings?.translation_mode || 'auto'}.title`;
  const modeLabel = t(modeKey) === modeKey ? t('translate.mode.auto.title') : t(modeKey);
  const hotkeyLabel = settings?.trans_hotkey?.shortcut || defaultTranslatorHotkeyLabel();

  return (
    <div className='page-stack home-page home-page--operator'>
      <section className='home-top-rail' aria-label={t('settings.overviewBadge')}>
        <div className='home-top-rail__brand'>
          <span className='home-top-rail__eyebrow'>{t('home.operator.badge')}</span>
          <div className='home-top-rail__title-row'>
            <div className='home-top-rail__title-wrap'>
              <h1 className='home-top-rail__title'>{t('common.appName')}</h1>
              <p className='home-top-rail__summary'>{t('home.operator.summary')}</p>
            </div>
            <span
              className={`home-top-rail__state ${
                enabled ? 'home-top-rail__state--online' : 'home-top-rail__state--paused'
              }`}>
              {enabled ? t('common.enabled') : t('common.paused')}
            </span>
          </div>
        </div>

        <div className='home-top-rail__telemetry' aria-live='polite'>
          <article className='home-top-rail__metric'>
            <span className='tool-caption'>{t('home.translationLanguage.title')}</span>
            <strong>{`${from} -> ${to}`}</strong>
          </article>
          <article className='home-top-rail__metric'>
            <span className='tool-caption'>{t('settings.strategy.scene')}</span>
            <strong>{scene}</strong>
          </article>
          <article className='home-top-rail__metric'>
            <span className='tool-caption'>{t('settings.strategy.tone')}</span>
            <strong>{modeLabel}</strong>
          </article>
          <article className='home-top-rail__metric'>
            <span className='tool-caption'>{t('home.hotkey.title')}</span>
            <strong>{hotkeyLabel}</strong>
          </article>
        </div>
      </section>

      <section className='home-operator-desk'>
        <article className='home-operator-desk__panel home-operator-desk__panel--controls'>
          <div className='home-operator-desk__panel-head'>
            <div className='home-operator-desk__heading'>
              <div className='workspace-section-label'>{t('home.operator.badge')}</div>
              <h2 className='workspace-section-title home-operator-desk__title'>
                {t('home.operator.title')}
              </h2>
            </div>
            <div className='home-operator-desk__status'>
              <span
                className={`home-operator-desk__status-dot ${
                  enabled
                    ? 'home-operator-desk__status-dot--online'
                    : 'home-operator-desk__status-dot--paused'
                }`}
              />
              <span>{enabled ? t('home.operator.ready') : t('home.operator.paused')}</span>
            </div>
          </div>

          <div className='home-control-grid'>
            <TranslationDirectionCard />
            <EnableStatusCard />
            <GameSceneCard />
            <HotkeyCard />
          </div>
        </article>

        <article className='home-operator-desk__panel home-operator-desk__panel--relay'>
          <div className='home-live-relay__head'>
            <div className='home-live-relay__heading'>
              <div className='workspace-section-label'>{t('home.live.badge')}</div>
              <h2 className='workspace-section-title home-live-relay__title'>
                {t('home.live.title')}
              </h2>
              <p className='tool-body home-live-relay__summary'>{t('home.live.summary')}</p>
            </div>
            <div className='home-live-relay__pills'>
              <span className='tool-pill tool-pill--accent'>{`${from} -> ${to}`}</span>
              <span className='tool-pill'>{scene}</span>
            </div>
          </div>

          <div className='home-live-relay'>
            <div className='home-live-relay__hud'>
              <div className='home-live-relay__signal'>
                <span
                  className={`home-live-relay__signal-dot ${
                    enabled
                      ? 'home-live-relay__signal-dot--online'
                      : 'home-live-relay__signal-dot--paused'
                  }`}
                />
                <span className='home-live-relay__signal-label'>
                  {enabled ? t('home.live.signalOnline') : t('home.live.signalPaused')}
                </span>
              </div>
              <div className='home-live-relay__meta'>
                <span>{modeLabel}</span>
                <span>{hotkeyLabel}</span>
              </div>
            </div>

            <article className='home-live-relay__message home-live-relay__message--source'>
              <div className='tool-caption'>{t('home.demo.sourceLabel')}</div>
              <div className='home-live-relay__text'>{t('home.demo.sourceText')}</div>
            </article>

            <div className='home-live-relay__bridge'>
              <ArrowRight className='h-4 w-4' />
              <span>{t('home.live.processing')}</span>
            </div>

            <article className='home-live-relay__message home-live-relay__message--result'>
              <div className='tool-caption'>{t('home.demo.resultLabel')}</div>
              <div className='home-live-relay__text'>{t('home.demo.resultText')}</div>
            </article>

            <div className='home-live-relay__footer'>
              <span>{t('home.live.autofill')}</span>
              <span>{`${scene} · ${modeLabel}`}</span>
            </div>
          </div>
        </article>
      </section>

      <section className='home-quick-strip'>
        <div className='home-quick-strip__head'>
          <div className='workspace-section-label'>{t('home.quick.badge')}</div>
          <p className='tool-body home-quick-strip__summary'>{t('home.quick.summary')}</p>
        </div>

        <div className='home-quick-strip__steps'>
          <QuickFlowStep
            index='01'
            title={t('home.guide.step1Title')}
            desc={t('home.guide.step1Desc')}
          />
          <QuickFlowStep
            index='02'
            title={t('home.guide.step2Title')}
            desc={t('home.guide.step2Desc')}
          />
          <QuickFlowStep
            index='03'
            title={t('home.guide.step3Title')}
            desc={t('home.guide.step3Desc')}
          />
        </div>
      </section>
    </div>
  );
}
