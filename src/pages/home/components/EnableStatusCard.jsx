import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../../../components/StoreProvider';
import { PowerToggle } from '../../../icons';
import { invokeCommand, hasTauriRuntime } from '../../../services/tauriRuntime';
import { showError, showSuccess } from '../../../utils/toast';

export default function EnableStatusCard() {
  const { settings, updateSettings, replaceSettings } = useStore();
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

      showSuccess(nextEnabled ? 'Lingo 已启用' : 'Lingo 已暂停');
    } catch (error) {
      setDraftState(null);
      showError(`切换失败: ${error}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <motion.section
      className='dota-card rounded-2xl p-6 h-full min-h-[248px] flex flex-col text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}>
      <div className='flex items-center gap-3'>
        <PowerToggle className='w-6 h-6 stroke-zinc-500' />
        <h3 className='tool-card-title'>启用状态</h3>
      </div>
      <p className='tool-body mt-2'>通过开关控制 Lingo 是否响应快捷键。</p>

      <div className='flex-1 flex flex-col mt-4'>
        <div className='mt-auto'>
          <div className='tool-control-slot home-top-control-slot mt-4'>
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
                  <span className='tool-control-text truncate'>
                    {isEnabled ? '已启用（可正常翻译）' : '已暂停（不响应快捷键）'}
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
          <div className='mt-2 h-4 text-xs text-zinc-500'>{pending ? '正在保存状态...' : '\u00A0'}</div>
        </div>
      </div>
    </motion.section>
  );
}
