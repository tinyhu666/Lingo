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

  const handleStatusChange = async (event) => {
    if (pending) {
      return;
    }

    const nextEnabled = event.target.value === 'enabled';
    if (nextEnabled === isEnabled) {
      return;
    }

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
      className='ui-card ui-card-glass rounded-2xl p-6 h-full min-h-[248px] flex flex-col text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}>
      <div className='flex items-center gap-3'>
        <PowerToggle className='w-5 h-5 text-[#a8b6d7]' />
        <h3 className='ui-card-title'>启用状态</h3>
      </div>
      <p className='ui-body mt-1'>通过软件状态下拉控制 AutoGG 开关。</p>

      <div className='flex-1 flex flex-col mt-4'>
        <div className='mt-auto'>
          <div className='flex items-center justify-between'>
            <div className='ui-caption'>软件状态</div>
            <span className={`ui-chip ${isEnabled ? 'ui-state-enabled' : 'ui-state-paused'}`}>
              {isEnabled ? '已启用' : '已暂停'}
            </span>
          </div>
          <div className='ui-control-slot mt-2'>
            <select
              value={isEnabled ? 'enabled' : 'paused'}
              onChange={handleStatusChange}
              disabled={pending}
              className={`home-top-control-shell ui-control-text px-3 pr-10 ${
                isEnabled ? 'ui-state-enabled' : 'ui-state-paused'
              } ${pending ? 'cursor-not-allowed opacity-70' : ''}`}>
              <option value='enabled'>已启用</option>
              <option value='paused'>已暂停</option>
            </select>
          </div>
          <div className='mt-2 h-4 text-xs text-[#8fa0bf]'>{pending ? '正在保存状态...' : '\u00A0'}</div>
        </div>
      </div>
    </motion.section>
  );
}
