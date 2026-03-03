import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { GamingPad, FaceOldFace, Whistle } from '../icons';
import { useStore } from '../components/StoreProvider';

const MODE_OPTIONS = [
  {
    id: 'auto',
    title: '自动模式',
    desc: '平衡准确、自然和可读性，适合大部分对局沟通。',
    icon: FaceOldFace,
  },
  {
    id: 'pro',
    title: '职业模式',
    desc: '术语更集中，指令更短，适合团队配合与节奏交流。',
    icon: GamingPad,
  },
  {
    id: 'toxic',
    title: '竞技模式',
    desc: '语气更直接，保持高压感但不过线，适合高强度对局。',
    icon: Whistle,
  },
];

const MODE_LABELS = {
  auto: '自动',
  pro: '职业',
  toxic: '竞技',
};

export default function Translate() {
  const { settings, updateSettings } = useStore();
  const [activeMode, setActiveMode] = useState(settings?.translation_mode || 'auto');

  useEffect(() => {
    if (settings?.translation_mode) {
      setActiveMode(settings.translation_mode);
    }
  }, [settings?.translation_mode]);

  const currentLabel = useMemo(() => MODE_LABELS[activeMode] || '自动', [activeMode]);

  const handleModeChange = async (mode) => {
    if (mode === activeMode) return;
    setActiveMode(mode);
    await updateSettings({ translation_mode: mode });
  };

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.section
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold text-zinc-900'>翻译模式</h1>
            <p className='mt-2 text-sm text-zinc-500'>
              选择一个输出风格。只会生效一个模式，改动后立即用于剪贴板翻译。
            </p>
          </div>
          <div className='tool-pill'>当前：{currentLabel}</div>
        </div>
      </motion.section>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {MODE_OPTIONS.map((mode, idx) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              type='button'
              className={`dota-card rounded-2xl p-6 min-h-[214px] text-left transition-all ${
                isActive
                  ? 'border-blue-300 bg-blue-50/70 shadow-[0_10px_24px_rgba(37,99,235,0.16)]'
                  : 'hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]'
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * (idx + 1) }}
              onClick={() => handleModeChange(mode.id)}>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2.5 text-zinc-700'>
                  <Icon className='w-5 h-5 stroke-zinc-600' />
                  <span className='text-base font-semibold'>{mode.title}</span>
                </div>
                <span
                  className={`text-xs rounded-full px-2 py-1 border ${
                    isActive
                      ? 'border-blue-300 text-blue-700 bg-blue-100'
                      : 'border-zinc-200 text-zinc-500 bg-zinc-50'
                  }`}>
                  {isActive ? '已启用' : '点击启用'}
                </span>
              </div>

              <p className='mt-4 text-sm text-zinc-500 leading-relaxed'>{mode.desc}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
