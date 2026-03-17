import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { GamingPad, FaceOldFace, Whistle, Sparkles } from '../icons';
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
    <div className='flex min-h-full flex-col gap-6'>
      <motion.section
        className='dota-card tool-rise p-6'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}>
        <div className='desktop-tight-header flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='min-w-0'>
            <h2 className='tool-page-title mt-0'>{t('translate.title')}</h2>
            <p className='tool-body mt-3'>{t('translate.summary')}</p>
          </div>
          <div className='desktop-tight-summary-card tool-subcard w-full min-w-0 px-4 py-3 sm:w-auto sm:min-w-[132px] sm:shrink-0'>
            <div className='tool-caption'>{t('translate.currentEnabled')}</div>
            <div className='tool-card-title mt-2'>{currentLabel}</div>
          </div>
        </div>
      </motion.section>

      <div className='translate-mode-grid'>
        {MODE_OPTIONS.map((mode, idx) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              type='button'
              onClick={() => handleModeChange(mode.id)}
              className={`dota-card tool-rise mode-card min-h-[260px] min-w-0 p-6 text-left ${
                isActive ? 'border-[rgba(129,163,255,0.92)] shadow-[0_22px_42px_rgba(76,111,255,0.16),inset_0_1px_0_rgba(255,255,255,0.96)]' : ''
              }`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * (idx + 1) }}>
              <div className='mode-card__top-row'>
                <div className={`workspace-header__icon mode-card__icon-shell h-11 w-11 min-w-[44px] ${isActive ? 'mode-card__icon-shell--active' : ''}`}>
                  <Icon className='h-5 w-5 stroke-current' />
                </div>
                <span className={`tool-pill shrink-0 ${isActive ? 'workspace-pill--success' : ''}`}>
                  {isActive ? t('translate.styleEnabled') : t('translate.stylePending')}
                </span>
              </div>

              <div className='mt-5'>
                <div className='tool-card-title'>{t(`translate.mode.${mode.id}.title`)}</div>
                <div className='tool-caption mt-2'>{isActive ? t('translate.activeNow') : t('translate.clickToSwitch')}</div>
              </div>

              <p className='tool-body mode-card__desc mt-5'>{t(`translate.mode.${mode.id}.desc`)}</p>
              <div className='tool-subcard mt-6 p-4'>
                <div className='flex items-center gap-2'>
                  <Sparkles className='h-4 w-4 stroke-zinc-500' />
                  <span className='tool-caption'>{t('common.hint')}</span>
                </div>
                <p className='tool-body mt-2'>{t(`translate.mode.${mode.id}.detail`)}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
