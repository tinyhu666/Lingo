import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { GamingPad, FaceOldFace, Whistle, Sparkles } from '../icons';
import { useStore } from '../components/StoreProvider';

const MODE_OPTIONS = [
  {
    id: 'auto',
    title: '自动模式',
    desc: '平衡准确、自然和可读性，适合大部分对局沟通。',
    detail: '优先输出自然、稳妥、可直接发送的表达。',
    icon: FaceOldFace,
  },
  {
    id: 'pro',
    title: '职业模式',
    desc: '术语更集中，指令更短，适合团队配合与节奏交流。',
    detail: '保留更多游戏术语和节奏词，更适合高频协同。',
    icon: GamingPad,
  },
  {
    id: 'toxic',
    title: '竞技模式',
    desc: '语气更直接，保持高压感但不过线，适合高强度对局。',
    detail: '强调短促、直接和冲击力，但避免失控表达。',
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
    <div className='flex h-full flex-col gap-6'>
      <motion.section
        className='dota-card tool-rise p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <div className='tool-pill mb-3'>当前策略</div>
            <h2 className='tool-page-title'>输出风格切换</h2>
            <p className='tool-body'>选择一个输出风格，切换后会立即用于后续翻译结果。</p>
          </div>
          <div className='tool-subcard min-w-[132px] shrink-0 px-4 py-3'>
            <div className='tool-caption'>当前已启用</div>
            <div className='tool-card-title mt-2'>{currentLabel}</div>
          </div>
        </div>
      </motion.section>

      <div className='grid grid-cols-3 gap-6'>
        {MODE_OPTIONS.map((mode, idx) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              type='button'
              onClick={() => handleModeChange(mode.id)}
              className={`dota-card tool-rise min-h-[260px] p-6 text-left ${
                isActive ? 'border-[rgba(129,163,255,0.92)] shadow-[0_22px_42px_rgba(76,111,255,0.16),inset_0_1px_0_rgba(255,255,255,0.96)]' : ''
              }`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * (idx + 1) }}>
              <div className='flex items-center justify-between gap-3'>
                <div className='workspace-header__icon h-11 w-11 min-w-[44px]'>
                  <Icon className='h-5 w-5 stroke-current' />
                </div>
                <span className={`tool-pill shrink-0 ${isActive ? 'workspace-pill--success' : ''}`}>
                  {isActive ? '已启用' : '待启用'}
                </span>
              </div>

              <div className='mt-5'>
                <div className='tool-card-title'>{mode.title}</div>
                <div className='tool-caption mt-2'>{isActive ? '当前生效中' : '点击切换到此模式'}</div>
              </div>

              <p className='tool-body mt-5'>{mode.desc}</p>
              <div className='tool-subcard mt-6 p-4'>
                <div className='flex items-center gap-2'>
                  <Sparkles className='h-4 w-4 stroke-zinc-500' />
                  <span className='tool-caption'>模式特点</span>
                </div>
                <p className='tool-body mt-2'>{mode.detail}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
