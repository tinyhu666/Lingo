import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Server, Sparkles, Globe, Cpu } from '../icons';
import { useStore } from '../components/StoreProvider';
import { getLanguageMeta } from '../constants/languages';

const SCENE_LABELS = {
  general: '通用',
  moba: 'MOBA',
  fps: 'FPS',
  mmo: 'MMO',
};

const MODE_LABELS = {
  auto: '自动',
  pro: '职业',
  toxic: '高压',
};

export default function Settings() {
  const { settings } = useStore();

  const serviceStatus = useMemo(() => {
    if (!settings) {
      return {
        label: '加载中',
        tone: 'text-zinc-600',
        hint: '正在加载本地设置...',
      };
    }

    if (settings.app_enabled === false) {
      return {
        label: '已暂停',
        tone: 'text-amber-600',
        hint: '当前不会响应翻译快捷键，可在主页重新启用。',
      };
    }

    return {
      label: '已启用',
      tone: 'text-emerald-600',
      hint: '快捷键可直接触发服务端翻译并自动回填。',
    };
  }, [settings]);

  const from = settings?.translation_from || 'zh';
  const to = settings?.translation_to || 'en';
  const scene = SCENE_LABELS[settings?.game_scene || 'general'] || settings?.game_scene || '通用';
  const mode = MODE_LABELS[settings?.translation_mode || 'auto'] || settings?.translation_mode || '自动';

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='tool-pill mb-3'>运行概览</div>
            <h2 className='tool-page-title'>服务状态与策略</h2>
            <p className='tool-body'>翻译服务由服务端统一托管，客户端只负责触发、接收和回填译文。</p>
          </div>
          <div className='tool-subcard min-w-[132px] shrink-0 px-4 py-3'>
            <div className='tool-caption'>客户端状态</div>
            <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
          </div>
        </div>
      </motion.section>

      <div className='grid grid-cols-2 gap-6'>
        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className='flex items-center gap-3 mb-5'>
            <Server className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>客户端状态</h3>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>当前状态</div>
              <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
              <p className='tool-body mt-2'>{serviceStatus.hint}</p>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>默认翻译语言</div>
              <div className='tool-card-title mt-2 text-zinc-900'>
                {getLanguageMeta(from).label} → {getLanguageMeta(to).label}
              </div>
              <p className='tool-body mt-2'>可在主页翻译语言卡中即时切换。</p>
            </div>
          </div>
        </motion.section>

        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className='flex items-center gap-3 mb-5'>
            <Cpu className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>翻译策略</h3>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>场景策略</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{scene}</div>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>语气风格</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{mode}</div>
            </div>
          </div>

          <div className='tool-subcard mt-4 p-4'>
            <div className='flex items-center gap-2'>
              <Sparkles className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>策略说明</span>
            </div>
            <p className='tool-body mt-2'>当前模型供应商、密钥和路由由服务端维护，客户端不开放编辑入口，避免本地误配置导致链路异常。</p>
          </div>
        </motion.section>
      </div>

      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className='flex items-center gap-3'>
          <Globe className='h-5 w-5 stroke-zinc-500' />
          <h3 className='tool-card-title'>服务说明</h3>
        </div>
        <p className='tool-body mt-3'>当客户端启用时，翻译会通过服务端统一模型配置执行；客户端负责把结果回填到当前输入框，减少游戏内切换成本。</p>
      </motion.section>
    </div>
  );
}
