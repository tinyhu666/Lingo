import { useMemo, useState } from 'react';
import { XClose, UserUser01, Spinner } from '../icons';
import { useAuth } from './AuthProvider';
import appIcon from '../assets/app-icon.png';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginModal() {
  const {
    modalOpen,
    modalMode,
    setModalMode,
    closeAuthModal,
    signIn,
    signUp,
    resendEmailVerification,
    actionLoading,
    configured,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const canSubmit = useMemo(() => {
    if (!EMAIL_REGEX.test(email) || password.length < 8) {
      return false;
    }

    if (modalMode === 'register') {
      return password === confirmPassword && confirmPassword.length >= 8;
    }

    return true;
  }, [confirmPassword, email, modalMode, password]);

  if (!modalOpen) {
    return null;
  }

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
  };

  const switchMode = (mode) => {
    setModalMode(mode);
    resetForm();
  };

  const submit = async () => {
    if (!canSubmit || actionLoading) {
      return;
    }

    if (modalMode === 'register') {
      const ok = await signUp(email, password);
      if (ok) {
        setConfirmPassword('');
      }
      return;
    }

    await signIn(email, password);
  };

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center p-4'>
      <div className='absolute inset-0 bg-black/30 backdrop-blur-sm' onClick={closeAuthModal} />

      <div className='relative w-full max-w-[420px] rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_30px_60px_rgba(15,23,42,0.2)]'>
        <div className='mb-5 flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <img src={appIcon} alt='Lingo' className='h-9 w-9 rounded-lg border border-zinc-200' />
            <div>
              <div className='tool-card-title'>Lingo 账号</div>
              <div className='tool-caption'>登录后即可启用翻译功能</div>
            </div>
          </div>
          <button type='button' onClick={closeAuthModal} className='rounded-lg p-1 text-zinc-500 hover:bg-zinc-100'>
            <XClose className='h-5 w-5' />
          </button>
        </div>

        {!configured ? (
          <div className='rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700'>
            当前未配置 Supabase 认证环境变量（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）。
          </div>
        ) : (
          <>
            <div className='mb-4 grid grid-cols-2 rounded-xl bg-zinc-100 p-1'>
              <button
                type='button'
                onClick={() => switchMode('login')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  modalMode === 'login' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                }`}>
                登录
              </button>
              <button
                type='button'
                onClick={() => switchMode('register')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  modalMode === 'register' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                }`}>
                注册
              </button>
            </div>

            <div className='space-y-3'>
              <div>
                <label className='tool-label block'>邮箱</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim())}
                  className='tool-input'
                  type='email'
                  placeholder='name@example.com'
                />
              </div>

              <div>
                <label className='tool-label block'>密码</label>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className='tool-input'
                  type='password'
                  placeholder='至少 8 位'
                />
              </div>

              {modalMode === 'register' ? (
                <div>
                  <label className='tool-label block'>确认密码</label>
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className='tool-input'
                    type='password'
                    placeholder='再次输入密码'
                  />
                </div>
              ) : null}
            </div>

            <button
              type='button'
              onClick={submit}
              disabled={!canSubmit || actionLoading}
              className={`mt-5 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm ${
                canSubmit && !actionLoading ? 'tool-btn-primary' : 'tool-btn opacity-70 cursor-not-allowed'
              }`}>
              {actionLoading ? <Spinner className='h-4 w-4 animate-spin' /> : <UserUser01 className='h-4 w-4' />}
              {modalMode === 'register' ? '注册并发送验证邮件' : '登录'}
            </button>

            <button
              type='button'
              onClick={() => resendEmailVerification()}
              disabled={!EMAIL_REGEX.test(email) || actionLoading}
              className='mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60'>
              重发验证邮件
            </button>

            <p className='mt-3 text-center text-xs text-zinc-500'>
              注册后需完成邮箱验证，验证成功后才能使用翻译。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
