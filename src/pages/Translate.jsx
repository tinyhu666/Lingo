import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { GamingPad, FaceOldFace, Whistle, Sparkles } from '../icons';
import { useStore } from '../components/StoreProvider';
import PageHeader from '../components/PageHeader';
import PanelCard from '../components/PanelCard';
import StatusChip from '../components/StatusChip';
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
    <div className='translate-page flex min-h-full flex-col gap-6'>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PanelCard className='tool-rise'>
          <PageHeader
            title={t('translate.title')}
            description={t('translate.summary')}
            actions={
              <StatusChip
                label={`${t('translate.currentEnabled')} · ${currentLabel}`}
                tone='info'
                className='translate-page__status-chip'
              />
            }
          />
        </PanelCard>
      </motion.div>

      <div className='translate-mode-grid'>
        {MODE_OPTIONS.map((mode, idx) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              type='button'
              onClick={() => handleModeChange(mode.id)}
              className={`panel-card panel-card--interactive tool-rise mode-card min-h-[260px] min-w-0 text-left ${isActive ? 'mode-card--active' : ''}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * (idx + 1) }}>
              <div className='mode-card__rail'>
                <div className={`workspace-header__icon mode-card__icon-shell h-11 w-11 min-w-[44px] ${isActive ? 'mode-card__icon-shell--active' : ''}`}>
                  <Icon className='h-5 w-5 stroke-current' />
                </div>
                <StatusChip
                  label={isActive ? t('translate.styleEnabled') : t('translate.stylePending')}
                  tone={isActive ? 'success' : 'neutral'}
                  className={`mode-card__state shrink-0 ${isActive ? 'mode-card__state--active' : ''}`}
                />
              </div>

              <div className='mode-card__content'>
                <div className='tool-card-title'>{t(`translate.mode.${mode.id}.title`)}</div>
                <div className='tool-caption mt-2'>{isActive ? t('translate.activeNow') : t('translate.clickToSwitch')}</div>
                <p className='tool-body mode-card__desc mt-4'>{t(`translate.mode.${mode.id}.desc`)}</p>
              </div>

              <div className='tool-subcard mode-card__hint p-4'>
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
