import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Server, Crown, Sparkles, UserUser01 } from '../icons';
import { useStore } from '../components/StoreProvider';
import { useAuth } from '../components/AuthProvider';

export default function Settings() {
  const { settings } = useStore();
  const {
    configured,
    authState,
    loading,
    refreshProfile,
    openAuthModal,
    isAdmin,
    profileMessage,
  } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [checking, setChecking] = useState(false);

  const serviceStatus = useMemo(() => {
    if (!configured) {
      return {
        label: '认证服务未配置',
        tone: 'text-red-600',
        hint: '请在环境变量中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。',
      };
    }

    if (!authState.loggedIn) {
      return {
        label: '等待登录',
        tone: 'text-zinc-600',
        hint: '登录后即可调用服务端翻译代理。',
      };
    }

    if (!authState.emailVerified) {
      return {
        label: '邮箱待验证',
        tone: 'text-amber-600',
        hint: '请先验证邮箱，验证成功后才能翻译。',
      };
    }

    return {
      label: '可用',
      tone: 'text-emerald-600',
      hint: '当前账号可直接使用服务端翻译能力。',
    };
  }, [configured, authState.emailVerified, authState.loggedIn]);

  const checkService = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.section
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='tool-page-title mb-4'>Lingo 服务设置</h1>
        <p className='tool-body text-zinc-600'>
          模型参数由服务端统一托管。普通用户无需填写 API Key 或模型信息，登录后即可使用翻译。
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

          <div className='space-y-4'>
            <div className='rounded-xl border border-zinc-200 bg-white p-4'>
              <div className='tool-caption'>翻译代理</div>
              <div className={`mt-1 text-base font-semibold ${serviceStatus.tone}`}>{serviceStatus.label}</div>
              <div className='tool-body mt-1'>{serviceStatus.hint}</div>
            </div>

            <div className='rounded-xl border border-zinc-200 bg-white p-4'>
              <div className='tool-caption'>当前账号</div>
              <div className='mt-1 text-base font-semibold text-zinc-800'>
                {authState.loggedIn ? authState.email : '未登录'}
              </div>
              <div className='tool-body mt-1'>
                {loading
                  ? '正在读取账号状态...'
                  : authState.loggedIn
                    ? authState.emailVerified
                      ? '邮箱已验证，可直接翻译。'
                      : '邮箱未验证，暂无法翻译。'
                    : '请先登录再使用翻译功能。'}
              </div>
              {profileMessage ? <div className='tool-caption mt-2 text-amber-600'>{profileMessage}</div> : null}
            </div>

            <div className='flex items-center justify-between gap-3 pt-1'>
              <button
                type='button'
                onClick={checkService}
                disabled={checking}
                className={`tool-btn px-4 py-2 text-sm ${checking ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {checking ? '检查中...' : '刷新状态'}
              </button>

              {!authState.loggedIn ? (
                <button type='button' onClick={() => openAuthModal('login')} className='tool-btn-primary px-4 py-2 text-sm'>
                  登录账号
                </button>
              ) : null}
            </div>
          </div>
        </motion.section>

        <motion.section
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}>
          <div className='flex items-center gap-3 mb-6'>
            <UserUser01 className='w-5 h-5 stroke-zinc-500' />
            <h2 className='tool-card-title'>账号与权限</h2>
          </div>

          <div className='space-y-4'>
            <div className='rounded-xl border border-zinc-200 bg-white p-4'>
              <div className='tool-caption'>角色</div>
              <div className='mt-1 text-base font-semibold text-zinc-800'>
                {authState.loggedIn ? (isAdmin ? '管理员' : '普通用户') : '游客'}
              </div>
              <div className='tool-body mt-1'>
                管理员可开启隐藏高级模式查看服务端线路状态；普通用户不会看到模型配置入口。
              </div>
            </div>

            {authState.quota ? (
              <div className='rounded-xl border border-zinc-200 bg-white p-4'>
                <div className='tool-caption'>配额信息</div>
                <pre className='mt-2 text-xs text-zinc-600 whitespace-pre-wrap'>
                  {JSON.stringify(authState.quota, null, 2)}
                </pre>
              </div>
            ) : null}

            {isAdmin ? (
              <div className='rounded-xl border border-blue-200 bg-blue-50 p-4'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-sm font-semibold text-blue-700'>隐藏高级模式</div>
                    <div className='tool-caption text-blue-600'>仅管理员可见，用于服务端线路巡检。</div>
                  </div>
                  <button
                    type='button'
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className='tool-btn px-3 py-2 text-xs'>
                    {showAdvanced ? '收起' : '展开'}
                  </button>
                </div>

                {showAdvanced ? (
                  <div className='mt-3 rounded-lg border border-blue-200 bg-white p-3'>
                    <div className='tool-caption'>当前客户端偏好（仅调试展示）</div>
                    <div className='tool-body mt-1'>
                      model_type: <span className='font-semibold text-zinc-700'>{settings?.model_type || 'openai'}</span>
                    </div>
                    <div className='tool-body'>
                      game_scene: <span className='font-semibold text-zinc-700'>{settings?.game_scene || 'moba'}</span>
                    </div>
                    <div className='tool-caption mt-2 text-zinc-500'>
                      提示：实际翻译参数以服务端配置为准，客户端本地模型配置不会生效。
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className='rounded-xl border border-zinc-200 bg-zinc-50 p-4'>
                <div className='flex items-center gap-2'>
                  <Crown className='w-4 h-4 stroke-zinc-500' />
                  <span className='text-sm font-semibold text-zinc-700'>高级模式已隐藏</span>
                </div>
                <div className='tool-caption mt-1'>普通用户无需配置模型，登录后可直接翻译。</div>
              </div>
            )}
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
          <h2 className='tool-card-title'>产品路线提示</h2>
        </div>
        <p className='tool-body mt-2'>
          当前版本已切换到服务端统一模型配置。后续会逐步支持更多游戏场景，并由服务端按场景下发术语与语气策略。
        </p>
      </motion.section>
    </div>
  );
}
