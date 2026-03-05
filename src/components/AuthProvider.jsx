import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { hasTauriRuntime } from '../services/tauriRuntime';
import {
  clearSessionInBackend,
  getSession,
  isSupabaseConfigured,
  loadAuthStateFromBackend,
  loadProfile,
  onAuthStateChange,
  resendVerifyEmail,
  signInWithEmail,
  signOutAuth,
  signUpWithEmail,
  syncSessionToBackend,
} from '../services/authClient';
import { showError, showSuccess } from '../utils/toast';

const AuthContext = createContext(null);

const DEFAULT_AUTH_STATE = {
  loggedIn: false,
  email: '',
  emailVerified: false,
  role: 'user',
  tokenExpired: false,
  quota: null,
};

const isAdminRole = (role) => String(role || '').toLowerCase() === 'admin';

const normalizeAuthErrorMessage = (error) => {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return '请求失败，请稍后重试。';
  }
  if (lower.includes('email not confirmed')) {
    return '邮箱尚未验证，请先完成邮箱验证。';
  }
  if (lower.includes('invalid login credentials')) {
    return '邮箱或密码错误，请检查后重试。';
  }
  if (lower.includes('email rate limit exceeded') || lower.includes('too many requests')) {
    return '操作过于频繁，请稍后再试。';
  }
  if (lower.includes('password should be at least')) {
    return '密码长度不足，请使用至少 8 位密码。';
  }
  if (lower.includes('invalid email')) {
    return '邮箱格式无效，请填写正确邮箱。';
  }

  return raw;
};

const toEmailVerified = (user, profile) => {
  const fromSupabase = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  if (fromSupabase) {
    return true;
  }
  return Boolean(profile?.email_verified);
};

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState(DEFAULT_AUTH_STATE);
  const [session, setSession] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('login');
  const [actionLoading, setActionLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const mountedRef = useRef(true);

  const openAuthModal = useCallback((mode = 'login') => {
    setModalMode(mode === 'register' ? 'register' : 'login');
    setModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const clearAuthState = useCallback(async () => {
    setSession(null);
    setAuthState(DEFAULT_AUTH_STATE);
    setProfileMessage('');
    await clearSessionInBackend();
  }, []);

  const applySession = useCallback(
    async (nextSession) => {
      if (!mountedRef.current) {
        return;
      }

      if (!nextSession?.access_token) {
        await clearAuthState();
        return;
      }

      const profile = await loadProfile(nextSession.access_token);
      const emailVerified = toEmailVerified(nextSession.user, profile);
      const role = profile?.role || 'user';

      await syncSessionToBackend({
        session: nextSession,
        role,
        emailVerified,
      });

      if (!mountedRef.current) {
        return;
      }

      setSession(nextSession);
      setAuthState({
        loggedIn: true,
        email: nextSession.user?.email || '',
        emailVerified,
        role,
        tokenExpired: false,
        quota: profile?.quota ?? null,
      });
      setProfileMessage(profile?.message || '');
    },
    [clearAuthState],
  );

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) {
      return;
    }

    const profile = await loadProfile(session.access_token);
    const emailVerified = toEmailVerified(session.user, profile);
    const role = profile?.role || authState.role;

    await syncSessionToBackend({
      session,
      role,
      emailVerified,
    });

    if (!mountedRef.current) {
      return;
    }

    setAuthState((prev) => ({
      ...prev,
      emailVerified,
      role,
      quota: profile?.quota ?? null,
      tokenExpired: false,
    }));
    setProfileMessage(profile?.message || '');
  }, [authState.role, session]);

  const signIn = useCallback(async (email, password) => {
    if (!isSupabaseConfigured) {
      showError('认证服务未配置，请联系管理员。');
      return false;
    }

    try {
      setActionLoading(true);
      const result = await signInWithEmail({ email, password });
      const nextSession = result?.session || (await getSession());
      await applySession(nextSession);

      if (!nextSession) {
        showError('登录失败，请重试。');
        return false;
      }

      const verified = Boolean(nextSession.user?.email_confirmed_at || nextSession.user?.confirmed_at);
      if (!verified) {
        showError('邮箱尚未验证，请先完成验证。');
      } else {
        showSuccess('登录成功');
        closeAuthModal();
      }

      return true;
    } catch (error) {
      showError(`登录失败: ${normalizeAuthErrorMessage(error)}`);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [applySession, closeAuthModal]);

  const signUp = useCallback(async (email, password) => {
    if (!isSupabaseConfigured) {
      showError('认证服务未配置，请联系管理员。');
      return false;
    }

    try {
      setActionLoading(true);
      await signUpWithEmail({ email, password });
      setModalMode('login');
      showSuccess('注册成功，请前往邮箱完成验证后登录。');
      return true;
    } catch (error) {
      showError(`注册失败: ${normalizeAuthErrorMessage(error)}`);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setActionLoading(true);
      await signOutAuth();
      await clearAuthState();
      showSuccess('已退出登录');
      return true;
    } catch (error) {
      showError(`退出失败: ${error.message || error}`);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [clearAuthState]);

  const resendEmailVerification = useCallback(async () => {
    const email = authState.email || session?.user?.email;
    if (!email) {
      showError('未获取到邮箱地址');
      return false;
    }

    try {
      setActionLoading(true);
      await resendVerifyEmail(email);
      showSuccess('验证邮件已发送，请检查邮箱。');
      return true;
    } catch (error) {
      showError(`发送失败: ${normalizeAuthErrorMessage(error)}`);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [authState.email, session?.user?.email]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        if (isSupabaseConfigured) {
          const currentSession = await getSession();
          await applySession(currentSession);
        } else {
          const backendState = await loadAuthStateFromBackend();
          if (backendState?.logged_in) {
            setAuthState({
              loggedIn: true,
              email: backendState?.email || '',
              emailVerified: Boolean(backendState?.email_verified),
              role: backendState?.role || 'user',
              tokenExpired: Boolean(backendState?.token_expired),
              quota: null,
            });
          }
        }
      } catch {
        // keep default state
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    const unsubs = [];

    if (isSupabaseConfigured) {
      unsubs.push(onAuthStateChange(applySession));
    }

    if (hasTauriRuntime()) {
      void listen('auth_required', (event) => {
        const reason = event?.payload?.reason;
        if (reason === 'email_unverified') {
          showError('请先验证邮箱后再使用翻译。');
        } else if (reason === 'token_expired') {
          showError('登录状态已过期，请重新登录。');
        } else {
          showError('请先登录后再使用翻译。');
        }
        openAuthModal('login');
      }).then((unlisten) => {
        unsubs.push(unlisten);
      });
    }

    void init();

    return () => {
      mountedRef.current = false;
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {
          // noop
        }
      });
    };
  }, [applySession, openAuthModal]);

  const value = useMemo(
    () => ({
      loading,
      configured: isSupabaseConfigured,
      authState,
      session,
      modalOpen,
      modalMode,
      actionLoading,
      profileMessage,
      isAdmin: isAdminRole(authState.role),
      openAuthModal,
      closeAuthModal,
      setModalMode,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      resendEmailVerification,
    }),
    [
      loading,
      authState,
      session,
      modalOpen,
      modalMode,
      actionLoading,
      profileMessage,
      openAuthModal,
      closeAuthModal,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      resendEmailVerification,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
};
