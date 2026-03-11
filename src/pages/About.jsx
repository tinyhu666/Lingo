import { motion } from 'framer-motion';
import { CircleInfo, Dock, GamingPad, Globe } from '../icons';
import { useUpdater } from '../components/UpdateProvider';
import { APP_VERSION_LABEL } from '../constants/version';

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
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '未知';
    }
    return parsed.toLocaleDateString();
  } catch {
    return '未知';
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
    supportsUpdater,
  } = useUpdater();

  const versionLabel = currentVersion ? `V${currentVersion}` : APP_VERSION_LABEL;
  const latestVersionLabel = latestVersion ? `V${latestVersion}` : '暂未获取';
  const actionLabel = !supportsUpdater
    ? '仅桌面端可用'
    : checking
      ? '检查中...'
      : downloading
        ? '下载并安装中...'
        : hasUpdate
          ? '立即更新'
          : '检查更新';
  const actionHandler = hasUpdate ? installUpdate : () => checkForUpdates({ silent: false });
  const actionDisabled = !supportsUpdater || checking || downloading;
  const shouldShowReleaseNotes = hasUpdate && Boolean(releaseBody);

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <Dock className='tool-section-head__icon' />
              <h2 className='tool-card-title'>客户端更新</h2>
            </div>
            <p className='tool-body tool-section-summary'>查看版本信息与更新状态。</p>
          </div>

          {supportsUpdater ? (
            <button
              type='button'
              onClick={actionHandler}
              disabled={actionDisabled}
              className={`min-w-[132px] justify-center whitespace-nowrap px-4 ${hasUpdate ? 'tool-btn-primary' : 'tool-btn'} ${actionDisabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {actionLabel}
            </button>
          ) : null}
        </div>

        <div className='mt-5 grid grid-cols-4 gap-3'>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>当前版本</div>
            <div className='tool-card-title mt-2'>{versionLabel}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>最新版本</div>
            <div className='tool-card-title mt-2'>{latestVersionLabel}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>发布日期</div>
            <div className='tool-card-title mt-2'>{formatReleaseDate(releaseDate)}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>上次检查</div>
            <div className='tool-body mt-2'>{formatTime(checkedAt)}</div>
          </div>
        </div>

        <div className='mt-4 space-y-3'>
          {!supportsUpdater ? (
            <div className='rounded-2xl border border-[rgba(205,216,230,0.94)] bg-[rgba(248,250,253,0.9)] p-4 text-sm text-zinc-600'>
              当前为预览环境，更新检测与安装仅在桌面客户端内可用。
            </div>
          ) : null}

          {hasUpdate ? (
            <div className='rounded-2xl border border-[rgba(252,202,212,0.94)] bg-[rgba(255,241,245,0.96)] p-4 text-sm text-red-600'>
              发现新版本 {latestVersionLabel}，点击“立即更新”即可在应用内完成下载和安装。
            </div>
          ) : null}

          {shouldShowReleaseNotes ? (
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>更新说明</div>
              <div className='tool-body mt-2 whitespace-pre-wrap break-words'>{releaseBody}</div>
            </div>
          ) : null}

          {downloading ? (
            <div className='tool-subcard p-4'>
              <div className='flex items-center justify-between text-xs font-semibold text-blue-700'>
                <span>下载进度</span>
                <span>{progressPercent}%</span>
              </div>
              <div className='mt-3 h-2 rounded-full bg-blue-100'>
                <div className='h-2 rounded-full bg-blue-600 transition-all' style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className='rounded-2xl border border-[rgba(252,202,212,0.94)] bg-[rgba(255,241,245,0.96)] p-4 text-sm text-red-600 break-words'>
              {errorMessage}
            </div>
          ) : null}
        </div>
      </motion.section>

      <motion.section
        className='dota-card tool-rise p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <CircleInfo className='tool-section-head__icon' />
              <h3 className='tool-card-title'>项目说明</h3>
            </div>
          </div>
        </div>
        <p className='tool-body tool-section-summary'>
          Lingo 是 Dota 2 爱好者（ID：萌新）在业余时间打造的兴趣项目，主要解决外服对局中的沟通问题。后续将带来翻译其他玩家发言的功能，敬请期待！
        </p>

        <div className='mt-5 grid grid-cols-3 gap-4'>
          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <CircleInfo className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>项目简介</span>
            </div>
            <p className='tool-body mt-3'>Powered by 萌新。当前版本聚焦桌面端游戏内翻译体验，支持快捷键触发、自动回填与应用内更新。</p>
          </div>

          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <GamingPad className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>核心特点</span>
            </div>
            <p className='tool-body mt-3'>针对游戏内对话做短句化输出，尽量保留技能、装备和指挥术语；支持中英俄等主流语言互译，减少沟通阻力。</p>
          </div>

          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <Globe className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>后续发展</span>
            </div>
            <p className='tool-body mt-3'>后续会继续扩展到更多游戏场景，优化翻译质量与更新体验，同时保持桌面工具链路稳定、直接、低打断。</p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
