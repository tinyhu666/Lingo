import { motion } from 'framer-motion';
import { GamingPad, Repeat01, IMac } from '../../../icons';
import { useEffect, useState } from 'react';
import { useStore } from '../../../components/StoreProvider';

export default function GameSceneCard() {
  const { settings, updateSettings } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const isDaily = settings?.daily_mode ?? false;

  useEffect(() => {
    if (settings && settings.game_scene !== 'dota2') {
      updateSettings({ game_scene: 'dota2' });
    }
  }, [settings, updateSettings]);

  const toggleDailyMode = async (event) => {
    event.stopPropagation();
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await updateSettings({ daily_mode: !isDaily });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className='dota-card relative h-full flex flex-col rounded-2xl p-6 transition-all duration-200 text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3 text-sm text-zinc-500'>
          {isDaily ? (
            <IMac className='w-6 h-6 stroke-zinc-500' />
          ) : (
            <GamingPad className='w-6 h-6 stroke-zinc-500' />
          )}
          {isDaily ? '日常模式' : 'Dota2 游戏模式'}
        </div>
        <button
          onClick={toggleDailyMode}
          disabled={isSaving}
          className={`tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isDaily
              ? 'bg-zinc-200 text-zinc-700'
              : 'bg-zinc-100 text-zinc-500'
          } ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}>
          <span>{isDaily ? '切到游戏模式' : '切到日常模式'}</span>
          <Repeat01 className='w-4 h-4 text-zinc-600 transition-colors' />
        </button>
      </div>
      <div className='flex-1 flex flex-col justify-between mt-4'>
        <div className='text-sm text-zinc-400'>
          {isDaily
            ? '日常模式不做 Dota2 术语强化，适合普通划词翻译。'
            : '已锁定 Dota2 场景：保留 BKB、TP、smoke 等术语，输出更短更适合游戏内即时发送。'}
        </div>
        {!isDaily && (
          <div className='text-2xl font-semibold text-zinc-900'>Dota 2</div>
        )}
      </div>
    </motion.div>
  );
}
