import { invokeCommand, hasTauriRuntime } from '../services/tauriRuntime';

const stringify = (value) => (typeof value === 'object' ? JSON.stringify(value) : String(value));

const sendBackendLog = async (message) => {
  if (!hasTauriRuntime()) {
    return;
  }

  try {
    await invokeCommand('log_to_backend', { message });
  } catch {
    // ignore backend log errors
  }
};

export const log = (...args) => {
  const message = args.map(stringify).join(' ');
  console.log(...args);
  void sendBackendLog(message);
};

export const logError = (...args) => {
  const message = args.map(stringify).join(' ');
  console.error(...args);
  void sendBackendLog(`[ERROR] ${message}`);
};
