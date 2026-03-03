import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../../../components/StoreProvider';
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

  const handleToggle = async () => {
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

      showSuccess(nextEnabled ? 'AutoGG 已启用' : 'AutoGG 已暂停');
    } catch (error) {
      setDraftState(null);
      showError(`切换失败: ${error}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <motion.section
      className='dota-card rounded-2xl p-6 h-full min-h-[248px]'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}>
      <div className='text-base font-semibold text-zinc-900'>启用状态</div>
      <p className='mt-1 text-sm text-zinc-500'>控制 AutoGG 是否接收快捷键并执行翻译。</p>

      <div className='mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3'>
        <div className='text-xs text-zinc-500'>软件状态</div>
        <div className='mt-1 text-sm font-semibold text-zinc-900'>
          {isEnabled ? '已启用（可正常翻译）' : '已暂停（不响应快捷键）'}
        </div>
      </div>

      <div className='mt-5 flex items-center justify-between'>
        <span className='text-sm text-zinc-500'>开关</span>
        <button
          type='button'
          onClick={handleToggle}
          disabled={pending}
          className={`relative inline-flex h-10 w-[94px] items-center rounded-full px-1 transition-all ${
            isEnabled ? 'bg-blue-600' : 'bg-zinc-300'
          } ${pending ? 'opacity-70 cursor-not-allowed' : ''}`}>
          <span
            className={`inline-block h-8 w-[42px] transform rounded-full bg-white shadow transition-transform ${
              isEnabled ? 'translate-x-[43px]' : 'translate-x-0'
            }`}
          />
          <span className='absolute left-3 text-[11px] font-semibold text-white/90'>
            {isEnabled ? 'ON' : ''}
          </span>
          <span className='absolute right-3 text-[11px] font-semibold text-zinc-600'>
            {isEnabled ? '' : 'OFF'}
          </span>
        </button>
      </div>
    </motion.section>
  );
}
