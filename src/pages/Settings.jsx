import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Server, Sparkles, Globe } from '../icons';
import { useStore } from '../components/StoreProvider';
import { getLanguageMeta } from '../constants/languages';

export default function Settings() {
  const { settings } = useStore();

  const serviceStatus = useMemo(() => {
    if (!settings) {
      return {
        label: '读取中',
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
  const scene = settings?.game_scene || 'general';
  const mode = settings?.translation_mode || 'auto';

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.section
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='tool-page-title mb-4'>Lingo 服务设置</h1>
        <p className='tool-body text-zinc-600'>
          翻译服务由服务端统一托管，客户端无需登录账号，也无需填写模型 API 参数。
        </p>
      </motion.section>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <motion.section
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}>
          <div className='flex items-center gap-3 mb-6'>
            <Server className='w-5 h-5 stroke-zinc-500' />
            <h2 className='tool-card-title'>服务状态</h2>
          </div>

          <div className='rounded-xl border border-zinc-200 bg-white p-4'>
            <div className='tool-caption'>翻译代理</div>
            <div className={`mt-1 text-base font-semibold ${serviceStatus.tone}`}>{serviceStatus.label}</div>
            <div className='tool-body mt-1'>{serviceStatus.hint}</div>
          </div>

          <div className='rounded-xl border border-zinc-200 bg-white p-4 mt-4'>
            <div className='tool-caption'>默认翻译语言</div>
            <div className='mt-1 text-base font-semibold text-zinc-800'>
              {getLanguageMeta(from).label} → {getLanguageMeta(to).label}
            </div>
            <div className='tool-body mt-1'>可在主页顶部“翻译语言”模块随时切换。</div>
          </div>
        </motion.section>

        <motion.section
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}>
          <div className='flex items-center gap-3 mb-6'>
            <Globe className='w-5 h-5 stroke-zinc-500' />
            <h2 className='tool-card-title'>当前策略</h2>
          </div>

          <div className='space-y-4'>
            <div className='rounded-xl border border-zinc-200 bg-white p-4'>
              <div className='tool-caption'>场景</div>
              <div className='mt-1 text-base font-semibold text-zinc-800'>{scene}</div>
            </div>
            <div className='rounded-xl border border-zinc-200 bg-white p-4'>
              <div className='tool-caption'>语气模式</div>
              <div className='mt-1 text-base font-semibold text-zinc-800'>{mode}</div>
            </div>
            <div className='rounded-xl border border-blue-200 bg-blue-50 p-4'>
              <div className='text-sm font-semibold text-blue-700'>配置说明</div>
              <div className='tool-caption text-blue-700 mt-1'>
                模型供应商与密钥由服务端维护，客户端仅负责翻译触发和结果回填。
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      <motion.section
        className='dota-card rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}>
        <div className='flex items-center gap-3'>
          <Sparkles className='w-5 h-5 stroke-zinc-500' />
          <h2 className='tool-card-title'>提示</h2>
        </div>
        <p className='tool-body mt-2'>
          本页面仅展示服务运行状态，不提供模型参数编辑入口，避免本地误配置导致翻译失败。
        </p>
      </motion.section>
    </div>
  );
}
