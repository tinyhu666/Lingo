import { hasTauriRuntime } from '../services/tauriRuntime';

export function isWindowsClient() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = String(navigator.userAgent || '').toLowerCase();
  return hasTauriRuntime() && userAgent.includes('windows');
}
