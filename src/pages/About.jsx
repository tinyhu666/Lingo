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

  const versionLabel = currentVersion ? `V${currentVersion}` : 'V1.2.0';
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
    <div className='h-full flex flex-col gap-5 ui-animate-in'>
      <motion.section
        className='ui-card ui-card-glass rounded-2xl p-6 space-y-4'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='ui-page-title'>关于 AutoGG</h1>
            <p className='ui-body mt-2'>
              当前版本：{versionLabel}。powerby 萌新。AutoGG 聚焦 Dota2 游戏内即时沟通翻译，支持全局快捷键、剪贴板翻译回填以及多厂商大模型 API。
            </p>
          </div>
          {hasUpdate ? <span className='ui-chip !bg-[#6c1e2e] !border-[#a54a5c]'>可更新</span> : null}
        </div>

        <div className='ui-soft-card p-4 space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Sparkles className='h-5 w-5 text-[#a8b6d7]' />
              <h2 className='ui-card-title text-[15px]'>版本更新</h2>
            </div>
            <button
              type='button'
              onClick={actionHandler}
              disabled={actionDisabled}
              className={`${hasUpdate ? 'ui-btn-primary' : 'ui-btn'} !h-10 !px-4 ${
                actionDisabled ? 'opacity-70 cursor-not-allowed' : ''
              }`}>
              {actionLabel}
            </button>
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <div className='ui-soft-card p-3'>
              <div className='ui-caption'>当前版本</div>
              <div className='ui-control-text mt-1'>{versionLabel}</div>
            </div>
            <div className='ui-soft-card p-3'>
              <div className='ui-caption'>最新版本</div>
              <div className='ui-control-text mt-1'>{latestVersionLabel}</div>
              <div className='ui-caption mt-1'>发布日期：{formatReleaseDate(releaseDate)}</div>
            </div>
          </div>

          {hasUpdate ? (
            <div className='ui-danger'>发现新版本 {latestVersionLabel}，点击“立即更新”即可在应用内下载并安装。</div>
          ) : null}

          {downloading ? (
            <div className='ui-soft-card p-3'>
              <div className='flex items-center justify-between ui-caption'>
                <span>下载进度</span>
                <span>{progressPercent}%</span>
              </div>
              <div className='mt-2 h-2 rounded-full bg-[#223048]'>
                <div
                  className='h-2 rounded-full bg-[#6dd3ff] transition-all'
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          {releaseBody ? (
            <div className='ui-soft-card p-3'>
              <div className='ui-caption mb-1'>更新日志</div>
              <div className='ui-body whitespace-pre-wrap'>{releaseBody}</div>
            </div>
          ) : null}

          <div className='ui-caption'>上次检查：{formatTime(checkedAt)}</div>

          {errorMessage ? <div className='ui-danger'>{errorMessage}</div> : null}
        </div>
      </motion.section>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-3'>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <DeveloperNote />
        </motion.div>

        <motion.section
          className='ui-card rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}>
          <div className='flex items-center gap-3'>
            <GamingPad className='w-6 h-6 text-[#a8b6d7]' />
            <h3 className='ui-card-title'>Dota2 场景优化</h3>
          </div>
          <p className='ui-body mt-4'>
            针对游戏内对话做短句化输出，尽量保留技能、装备和指挥术语，减少“翻译腔”。
          </p>
        </motion.section>

        <motion.section
          className='ui-card rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}>
          <div className='flex items-center gap-3'>
            <Globe className='w-6 h-6 text-[#a8b6d7]' />
            <h3 className='ui-card-title'>多语言互译</h3>
          </div>
          <p className='ui-body mt-4'>支持中文、英文、俄文等主流语言的双向翻译，满足国际服沟通需求。</p>
        </motion.section>
      </div>
    </div>
  );
}
