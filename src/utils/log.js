import { invokeCommand, hasTauriRuntime } from '../services/tauriRuntime';

const MAX_LOG_LENGTH = 4000;

const stringify = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'bigint') {
    return `${value}n`;
  }

  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }

  try {
    return JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? `${nestedValue}n` : nestedValue,
    );
  } catch {
    return String(value);
  }
};

const buildMessage = (args, prefix = '') => {
  const message = `${prefix}${args.map(stringify).join(' ')}`;
  return message.length > MAX_LOG_LENGTH ? `${message.slice(0, MAX_LOG_LENGTH - 1)}…` : message;
};

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
  const message = buildMessage(args);
  console.log(...args);
  void sendBackendLog(message);
};

export const logError = (...args) => {
  const message = buildMessage(args, '[ERROR] ');
  console.error(...args);
  void sendBackendLog(message);
};
