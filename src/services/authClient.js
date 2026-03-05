import { invokeCommand, invokeIfPossible, hasTauriRuntime } from './tauriRuntime';
import { supabase, supabaseAnonKey, supabaseUrl, isSupabaseConfigured } from '../lib/supabase';

const ME_ENDPOINT = '/functions/v1/me';

export const getSession = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
};

export const onAuthStateChange = (handler) => {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    void handler(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
};

export const signUpWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('认证服务未配置');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const signInWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('认证服务未配置');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const signOutAuth = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

export const resendVerifyEmail = async (email) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('认证服务未配置');
  }

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });

  if (error) {
    throw error;
  }
};

const normalizeRole = (role) => {
  if (!role) {
    return 'user';
  }
  return String(role).toLowerCase() === 'admin' ? 'admin' : 'user';
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
};

export const loadProfile = async (accessToken) => {
  if (!accessToken || !supabaseUrl) {
    return {
      role: 'user',
      email_verified: false,
      quota: null,
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}${ME_ENDPOINT}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        role: 'user',
        email_verified: false,
        quota: null,
        message: payload?.message || '读取用户信息失败',
      };
    }

    return {
      role: normalizeRole(payload?.role),
      email_verified: toBoolean(payload?.email_verified),
      quota: payload?.quota ?? null,
    };
  } catch {
    return {
      role: 'user',
      email_verified: false,
      quota: null,
    };
  }
};

const buildSessionPayload = ({ session, role = 'user', emailVerified = false }) => {
  const user = session?.user;
  return {
    access_token: session?.access_token || '',
    refresh_token: session?.refresh_token || '',
    expires_at: session?.expires_at || 0,
    user_id: user?.id || '',
    email: user?.email || '',
    email_verified: Boolean(emailVerified),
    role: normalizeRole(role),
  };
};

export const syncSessionToBackend = async ({ session, role, emailVerified }) => {
  if (!hasTauriRuntime()) {
    return null;
  }

  const payload = buildSessionPayload({
    session,
    role,
    emailVerified,
  });

  return invokeCommand('set_auth_session', { payload });
};

export const clearSessionInBackend = async () => {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeIfPossible('clear_auth_session');
};

export const loadAuthStateFromBackend = async () => {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeIfPossible('get_auth_state');
};

export { isSupabaseConfigured };
