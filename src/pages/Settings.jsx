import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Server, Sparkles, Globe, Cpu } from '../icons';
import { useStore } from '../components/StoreProvider';
import { getLanguageMeta } from '../constants/languages';
import { useI18n } from '../i18n/I18nProvider';

export default function Settings() {
  const { settings } = useStore();
  const { locale, t } = useI18n();

  const serviceStatus = useMemo(() => {
    if (!settings) {
      return {
        label: t('settings.loading'),
        tone: 'text-zinc-600',
        hint: t('settings.loadingHint'),
      };
    }

    if (settings.app_enabled === false) {
      return {
        label: t('settings.paused'),
        tone: 'text-amber-600',
        hint: t('settings.pausedHint'),
      };
    }

    return {
      label: t('settings.enabled'),
      tone: 'text-emerald-600',
      hint: t('settings.enabledHint'),
    };
  }, [settings, t]);

  const from = settings?.translation_from || 'zh';
  const to = settings?.translation_to || 'en';
  const scene = t(`settings.scene.${settings?.game_scene || 'general'}`);
  const modeKey = `translate.mode.${settings?.translation_mode || 'auto'}.title`;
  const modeLabel = t(modeKey) === modeKey ? t('translate.mode.auto.title') : t(modeKey);

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className='flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0'>
            <div className='tool-pill mb-3'>{t('settings.overviewBadge')}</div>
            <h2 className='tool-page-title'>{t('settings.title')}</h2>
            <p className='tool-body'>{t('settings.summary')}</p>
          </div>
          <div className='tool-subcard w-full min-w-0 px-4 py-3 sm:w-auto sm:min-w-[132px] sm:shrink-0'>
            <div className='tool-caption'>{t('settings.statusCard')}</div>
            <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
          </div>
        </div>
      </motion.section>

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className='flex items-center gap-3 mb-5'>
            <Server className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>{t('settings.section.status')}</h3>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.statusCard')}</div>
              <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
              <p className='tool-body mt-2'>{serviceStatus.hint}</p>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.defaultLanguage')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>
                {getLanguageMeta(from, locale).label} → {getLanguageMeta(to, locale).label}
              </div>
              <p className='tool-body mt-2'>{t('settings.defaultLanguageHint')}</p>
            </div>
          </div>
        </motion.section>

        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className='flex items-center gap-3 mb-5'>
            <Cpu className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>{t('settings.section.strategy')}</h3>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.strategy.scene')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{scene}</div>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.strategy.tone')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{modeLabel}</div>
            </div>
          </div>

          <div className='tool-subcard mt-4 p-4'>
            <div className='flex items-center gap-2'>
              <Sparkles className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('settings.strategy.hintTitle')}</span>
            </div>
            <p className='tool-body mt-2'>{t('settings.strategy.hintBody')}</p>
          </div>
        </motion.section>
      </div>

      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className='flex items-center gap-3'>
          <Globe className='h-5 w-5 stroke-zinc-500' />
          <h3 className='tool-card-title'>{t('settings.section.service')}</h3>
        </div>
        <p className='tool-body mt-3'>{t('settings.serviceSummary')}</p>
      </motion.section>
    </div>
  );
}
