import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const hasTauriRuntime = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const internals = window.__TAURI_INTERNALS__;
  return Boolean(internals && typeof internals.invoke === 'function');
};

export const invokeCommand = async (command, payload = {}) => {
  if (!hasTauriRuntime() || typeof tauriInvoke !== 'function') {
    throw new Error('当前环境不支持 Tauri 命令');
  }

  return tauriInvoke(command, payload);
};

export const invokeIfPossible = async (command, payload = {}, fallbackValue = null) => {
  try {
    return await invokeCommand(command, payload);
  } catch {
    return fallbackValue;
  }
};
