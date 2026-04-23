import { useEffect, useMemo, useState } from 'react';
import { GamingPad, FaceOldFace, Whistle, Sparkles, Translate as TranslateIcon } from '../icons';
import PageHeader from '../components/PageHeader';
import { useStore } from '../components/StoreProvider';
import { showError } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import { useI18n } from '../i18n/I18nProvider';

const MODE_OPTIONS = [
  {
    id: 'auto',
    icon: FaceOldFace,
  },
  {
    id: 'pro',
    icon: GamingPad,
  },
  {
    id: 'toxic',
    icon: Whistle,
  },
];

export default function Translate() {
  const { settings, updateSettings } = useStore();
  const { t } = useI18n();
  const [activeMode, setActiveMode] = useState(settings?.translation_mode || 'auto');

  useEffect(() => {
    if (settings?.translation_mode) {
      setActiveMode(settings.translation_mode);
    }
  }, [settings?.translation_mode]);

  const currentLabel = useMemo(() => {
    const key = `translate.mode.${activeMode}.title`;
    const hit = t(key);
    return hit === key ? t('translate.mode.auto.title') : hit;
  }, [activeMode, t]);

  const handleModeChange = async (mode) => {
    if (mode === activeMode) return;
    const previousMode = activeMode;
    setActiveMode(mode);
    try {
      await updateSettings({ translation_mode: mode });
    } catch (error) {
      setActiveMode(previousMode);
      showError(t('translate.switchFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <div className='page-stack translate-page translate-page--ops'>
      <PageHeader
        eyebrow={t('sidebar.nav.translate')}
        title={t('translate.title')}
        summary={t('translate.summary')}
        icon={TranslateIcon}
        aside={
          <div className='page-header__badge-cluster'>
            <span className='tool-pill tool-pill--accent'>{currentLabel}</span>
          </div>
        }
      />

      <section className='translate-workbench translate-workbench--ops'>
        <div className='translate-workbench__lead translate-workbench__lead--ops'>
          <div className='translate-workbench__copy'>
            <div className='workspace-section-label'>{t('translate.currentEnabled')}</div>
            <h2 className='workspace-section-title translate-workbench__title'>{currentLabel}</h2>
            <p className='tool-body'>{t('translate.summary')}</p>
          </div>
          <div className='translate-workbench__state'>
            <span className='translate-workbench__state-dot' />
            <span>{t('translate.activeNow')}</span>
          </div>
        </div>

        <div className='translate-mode-grid translate-mode-grid--ops'>
          {MODE_OPTIONS.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.id;
            return (
                <button
                  key={mode.id}
                  type='button'
                  onClick={() => handleModeChange(mode.id)}
                  aria-pressed={isActive}
                  className={`tool-rise mode-card translate-mode-card translate-mode-card--ops min-w-0 text-left ${
                    isActive ? 'translate-mode-card--active' : ''
                  }`}>
                  <div className='mode-card__top-row'>
                    <div className={`workspace-header__icon mode-card__icon-shell h-11 w-11 min-w-[44px] ${isActive ? 'mode-card__icon-shell--active' : ''}`}>
                      <Icon className='h-5 w-5 stroke-current' />
                  </div>
                  <span className={`tool-pill shrink-0 ${isActive ? 'workspace-pill--success' : ''}`}>
                    {isActive ? t('translate.styleEnabled') : t('translate.stylePending')}
                  </span>
                </div>

                <div className='translate-mode-card__main'>
                  <div className='tool-card-title'>{t(`translate.mode.${mode.id}.title`)}</div>
                  <div className='tool-caption translate-mode-card__meta'>
                    {isActive ? t('translate.activeNow') : t('translate.clickToSwitch')}
                  </div>
                  <p className='tool-body mode-card__desc'>{t(`translate.mode.${mode.id}.desc`)}</p>
                </div>

                <div className='translate-mode-card__hint translate-mode-card__hint--ops'>
                  <div className='flex items-center gap-2'>
                    <Sparkles className='h-4 w-4 stroke-zinc-500' />
                    <span className='tool-caption'>{t('common.hint')}</span>
                  </div>
                  <p className='tool-body mt-2'>{t(`translate.mode.${mode.id}.detail`)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
