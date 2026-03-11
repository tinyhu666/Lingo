import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../../../components/StoreProvider';
import { PowerToggle } from '../../../icons';
import { invokeCommand, hasTauriRuntime } from '../../../services/tauriRuntime';
import { showError, showSuccess } from '../../../utils/toast';
import { toErrorMessage } from '../../../utils/error';
import { useI18n } from '../../../i18n/I18nProvider';

export default function EnableStatusCard() {
  const { settings, updateSettings, replaceSettings } = useStore();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [draftState, setDraftState] = useState(null);

  const persistedEnabled = settings?.app_enabled ?? true;
  const isEnabled = typeof draftState === 'boolean' ? draftState : persistedEnabled;

  useEffect(() => {
    setDraftState(null);
  }, [persistedEnabled]);

  const handleStatusToggle = async () => {
    if (pending) {
      return;
    }

    const nextEnabled = !isEnabled;

    setDraftState(nextEnabled);
    setPending(true);

    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('set_app_enabled', { enabled: nextEnabled });
        if (latest && typeof latest === 'object') {
          await replaceSettings(latest);
        } else {
          await updateSettings({ app_enabled: nextEnabled });
        }
      } else {
        await updateSettings({ app_enabled: nextEnabled });
      }

      showSuccess(nextEnabled ? t('home.enableStatus.toggleEnabledSuccess') : t('home.enableStatus.togglePausedSuccess'));
    } catch (error) {
      setDraftState(null);
      showError(t('home.enableStatus.toggleFailed', { error: toErrorMessage(error) }));
    } finally {
      setPending(false);
    }
  };

  return (
    <motion.section
      className='dota-card tool-rise w-full min-h-[248px] min-w-0 flex-1 rounded-2xl px-6 pt-6 pb-3 flex flex-col text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}>
      <div className='flex items-center gap-3'>
        <PowerToggle className='w-6 h-6 stroke-zinc-500' />
        <h3 className='tool-card-title'>{t('home.enableStatus.title')}</h3>
      </div>

      <div className='flex-1 flex flex-col mt-4'>
        <div className='home-top-copy'>
          <p className='tool-body'>{t('home.enableStatus.desc')}</p>
        </div>

        <div className='home-top-actions'>
          <div className='tool-control-slot home-top-control-slot'>
            <div className='home-top-control-shell'>
              <button
                type='button'
                onClick={handleStatusToggle}
                disabled={pending}
                aria-pressed={isEnabled}
                className={`home-status-toggle home-top-control-frame ${
                  isEnabled ? 'home-status-toggle--enabled' : 'home-status-toggle--paused'
                } ${pending ? 'cursor-not-allowed opacity-70' : ''}`}>
                <span className='flex min-w-0 items-center gap-2.5'>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      isEnabled ? 'bg-emerald-500' : 'bg-zinc-400'
                    }`}
                  />
                  <span className='tool-control-text whitespace-nowrap'>
                    {isEnabled ? t('common.enabled') : t('common.paused')}
                  </span>
                </span>

                <span
                  className={`home-status-switch ${
                    isEnabled ? 'home-status-switch--enabled' : 'home-status-switch--paused'
                  }`}>
                  <span
                    className={`home-status-switch-thumb ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
