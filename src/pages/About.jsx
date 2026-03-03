import { motion } from 'framer-motion';
import { GamingPad, Globe, Sparkles } from '../icons';
import DeveloperNote from '../components/DeveloperNote';
import { useUpdater } from '../components/UpdateProvider';

const formatTime = (timestamp) => {
  if (!timestamp) {
    return '未检查';
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '未检查';
  }
};

const formatReleaseDate = (value) => {
  if (!value) {
    return '未知';
  }
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
};

export default function About() {
  const {
    supportsUpdater,
    currentVersion,
    latestVersion,
    hasUpdate,
    checking,
    downloading,
    progressPercent,
    checkedAt,
    releaseDate,
    releaseBody,
    errorMessage,
    checkForUpdates,
    installUpdate,
  } = useUpdater();

  const versionLabel = currentVersion ? `V${currentVersion}` : 'V0.1.6';
  const latestVersionLabel = latestVersion ? `V${latestVersion}` : '暂未获取';
  const actionLabel = checking
    ? '检查中...'
    : downloading
      ? '下载并安装中...'
      : hasUpdate
        ? '立即更新'
        : '检查更新';
  const actionHandler = hasUpdate ? installUpdate : () => checkForUpdates({ silent: false });
  const actionDisabled = checking || downloading;

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.section
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='text-2xl font-bold text-zinc-900 mb-4'>关于 AutoGG</h1>
        <p className='text-zinc-600'>
          当前版本：{versionLabel}。powerby 萌新。AutoGG 聚焦 Dota2 游戏内即时沟通翻译，支持全局快捷键、剪贴板翻译回填以及多厂商大模型 API。
        </p>

        <div className='mt-5 rounded-xl border border-zinc-200 bg-white/80 p-4 space-y-3'>
          <div className='flex items-center gap-2 text-sm text-zinc-500'>
            <Sparkles className='w-5 h-5 stroke-zinc-500' />
            版本更新
          </div>

          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div className='space-y-1'>
              <div className='text-sm text-zinc-700'>
                当前版本 <span className='font-semibold text-zinc-900'>{versionLabel}</span>，最新版本{' '}
                <span className='font-semibold text-zinc-900'>{latestVersionLabel}</span>
              </div>
              <div className='text-xs text-zinc-500'>
                发布日期：{formatReleaseDate(releaseDate)}，上次检查：{formatTime(checkedAt)}
              </div>
            </div>

            <button
              type='button'
              onClick={actionHandler}
              disabled={actionDisabled}
              className={`px-4 py-2 text-sm ${actionDisabled ? 'opacity-70 cursor-not-allowed' : ''} ${
                hasUpdate ? 'tool-btn-primary' : 'tool-btn'
              }`}>
              {actionLabel}
            </button>
          </div>

          <div className='space-y-3'>
            {hasUpdate ? (
              <div className='rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
                发现新版本 {latestVersionLabel}，点击“立即更新”即可在应用内下载并安装。
              </div>
            ) : (
              <div className='rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500'>
                {supportsUpdater ? '当前未检测到可用更新。' : '当前环境不支持自动更新。'}
              </div>
            )}

            {releaseBody ? (
              <div className='rounded-xl border border-zinc-200 bg-white p-3'>
                <div className='text-xs text-zinc-500 mb-1'>更新说明</div>
                <div className='text-sm text-zinc-700 whitespace-pre-wrap'>{releaseBody}</div>
              </div>
            ) : null}

            {downloading ? (
              <div className='rounded-xl border border-blue-200 bg-blue-50 p-3'>
                <div className='flex items-center justify-between text-xs text-blue-700'>
                  <span>下载进度</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className='mt-2 h-2 rounded-full bg-blue-100'>
                  <div
                    className='h-2 rounded-full bg-blue-600 transition-all'
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div className='rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
                {errorMessage}
              </div>
            ) : null}
          </div>
        </div>
      </motion.section>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <DeveloperNote />
        </motion.div>

        <motion.section
          className='dota-card rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500'>
            <GamingPad className='w-6 h-6 stroke-zinc-500' />
            Dota2 场景优化
          </div>
          <p className='mt-4 text-sm text-zinc-400'>
            针对游戏内对话做短句化输出，尽量保留技能、装备和指挥术语，减少“翻译腔”。
          </p>
        </motion.section>

        <motion.section
          className='dota-card rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500'>
            <Globe className='w-6 h-6 stroke-zinc-500' />
            多语言互译
          </div>
          <p className='mt-4 text-sm text-zinc-400'>
            支持中文、英文、俄文等主流语言的双向翻译，满足国际服沟通需求。
          </p>
        </motion.section>
      </div>
    </div>
  );
}
