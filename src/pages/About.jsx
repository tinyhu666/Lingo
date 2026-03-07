import { motion } from 'framer-motion';
import { GamingPad, Globe, Sparkles, InfoCircle } from '../icons';
import DeveloperNote from '../components/DeveloperNote';
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

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <div className='tool-pill mb-3'>版本中心</div>
            <h2 className='tool-page-title'>客户端更新</h2>
            <p className='tool-body'>集中查看版本信息、更新状态和项目说明，安装新版本时无需离开客户端。</p>
          </div>
          <button
            type='button'
            onClick={actionHandler}
            disabled={actionDisabled}
            className={`min-w-[132px] justify-center whitespace-nowrap px-4 ${hasUpdate ? 'tool-btn-primary' : 'tool-btn'} ${actionDisabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
            {actionLabel}
          </button>
        </div>

        <div className='mt-6 grid grid-cols-3 gap-4'>
          <div className='tool-subcard p-4'>
            <div className='tool-caption'>当前版本</div>
            <div className='tool-card-title mt-2'>{versionLabel}</div>
          </div>
          <div className='tool-subcard p-4'>
            <div className='tool-caption'>最新版本</div>
            <div className='tool-card-title mt-2'>{latestVersionLabel}</div>
          </div>
          <div className='tool-subcard p-4'>
            <div className='tool-caption'>发布日期</div>
            <div className='tool-card-title mt-2'>{formatReleaseDate(releaseDate)}</div>
          </div>
        </div>

        <div className='mt-4 space-y-3'>
          <div className='tool-subcard p-4'>
            <div className='tool-caption'>上次检查</div>
            <p className='tool-body mt-2'>{formatTime(checkedAt)}</p>
          </div>

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

          {releaseBody ? (
            <div className='tool-subcard p-4'>
              <div className='tool-caption'>更新说明</div>
              <div className='tool-body mt-2 whitespace-pre-wrap'>{releaseBody}</div>
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
            <div className='rounded-2xl border border-[rgba(252,202,212,0.94)] bg-[rgba(255,241,245,0.96)] p-4 text-sm text-red-600'>
              {errorMessage}
            </div>
          ) : null}
        </div>
      </motion.section>

      <div className='grid grid-cols-3 gap-6'>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <DeveloperNote />
        </motion.div>

        <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className='flex items-center gap-3'>
            <GamingPad className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>游戏场景优化</h3>
          </div>
          <p className='tool-body mt-4'>针对游戏内对话做短句化输出，尽量保留技能、装备和指挥术语，减少“翻译腔”。</p>
        </motion.section>

        <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <div className='flex items-center gap-3'>
            <Globe className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>多语言互译</h3>
          </div>
          <p className='tool-body mt-4'>支持中文、英文、俄文等主流语言的双向翻译，满足不同地区玩家的即时沟通需求。</p>
          <div className='tool-subcard mt-4 p-4'>
            <div className='flex items-center gap-2'>
              <InfoCircle className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>项目方向</span>
            </div>
            <p className='tool-body mt-2'>Lingo 会继续扩展到更多游戏，不局限于单一题材或单一服务器环境。</p>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
