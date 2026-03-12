import { hasTauriRuntime } from '../services/tauriRuntime';

export function getDesktopPlatform() {
  if (typeof navigator === 'undefined' || !hasTauriRuntime()) {
    return null;
  }

  const userAgent = String(navigator.userAgent || '').toLowerCase();
  if (userAgent.includes('windows')) {
    return 'windows';
  }

  if (userAgent.includes('mac os x') || userAgent.includes('macintosh')) {
    return 'macos';
  }

  return 'desktop';
}

export function isWindowsClient() {
  return getDesktopPlatform() === 'windows';
}
