import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { invokeCommand } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import {
  APP_VERSION,
  RELEASE_API_URL,
  RELEASE_LATEST_JSON_URL,
  RELEASE_PAGE_URL,
} from '../constants/version';
import { useI18n } from '../i18n/I18nProvider';

const UpdateContext = createContext(null);

const DEFAULT_STATE = {
  checking: false,
  downloading: false,
  hasUpdate: false,
  latestVersion: null,
  currentVersion: null,
  releaseDate: null,
  releaseBody: null,
  progressPercent: 0,
  checkedAt: null,
  errorMessage: null,
};

const normalizeVersion = (value) => String(value || '').replace(/^v/i, '').trim();

const isVersionNewer = (incoming, current) => {
  const nextParts = normalizeVersion(incoming)
    .split('.')
    .map((item) => Number.parseInt(item, 10) || 0);
  const currentParts = normalizeVersion(current)
    .split('.')
    .map((item) => Number.parseInt(item, 10) || 0);
  const length = Math.max(nextParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const nextValue = nextParts[index] || 0;
    const currentValue = currentParts[index] || 0;

    if (nextValue > currentValue) {
      return true;
    }

    if (nextValue < currentValue) {
      return false;
    }
  }

  return false;
};

const normalizeReleaseDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number.parseInt(trimmed, 10);
      if (Number.isFinite(numeric)) {
        const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        const parsed = new Date(millis);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const resolveReleaseDate = (updaterDate, fallbackDate) => normalizeReleaseDate(updaterDate) || normalizeReleaseDate(fallbackDate);
const buildReleaseDatePatch = (value) => {
  const normalized = normalizeReleaseDate(value);
  return normalized ? { releaseDate: normalized } : {};
};

const formatUpdaterError = (error, { currentVersion, latestRelease, t } = {}) => {
  const message = String(error?.message || error || t('update.unknownError'));
  const isKeyMismatch = /UnexpectedKeyId/i.test(message) || /key id/i.test(message);
  const isMissingManifest =
    message.includes('Could not fetch a valid release JSON from the remote') ||
    /latest\.json/i.test(message) ||
    /\b404\b/i.test(message) ||
    /Not Found/i.test(message);

  if (isKeyMismatch) {
    const hasNewerRelease = latestRelease?.version && isVersionNewer(latestRelease.version, currentVersion || APP_VERSION);
    if (hasNewerRelease) {
      return t('update.keyMismatchWithVersion', {
        version: latestRelease.version,
        url: RELEASE_PAGE_URL,
      });
    }
    return t('update.keyMismatch', { url: RELEASE_PAGE_URL });
  }

  if (!isMissingManifest) {
    return message;
  }

  if (latestRelease?.version && isVersionNewer(latestRelease.version, currentVersion || APP_VERSION)) {
    return t('update.missingManifestWithVersion', {
      version: latestRelease.version,
    });
  }

  return t('update.missingManifest');
};

const fetchLatestReleaseFromApi = async (t) => {
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(t('update.releaseApiFailed', { status: response.status }));
  }

  const payload = await response.json();

  return {
    version: normalizeVersion(payload.tag_name),
    publishedAt: payload.published_at || payload.created_at || null,
    body: payload.body || null,
  };
};

const fetchLatestReleaseFromManifest = async (t) => {
  const response = await fetch(RELEASE_LATEST_JSON_URL, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(t('update.manifestFailed', { status: response.status }));
  }

  const payload = await response.json();

  return {
    version: normalizeVersion(payload.version),
    publishedAt: payload.pub_date || payload.published_at || payload.created_at || null,
    body: payload.notes || null,
  };
};

const fetchLatestReleaseMetadata = async (t) => {
  if (hasTauriRuntime()) {
    try {
      const payload = await invokeCommand('get_latest_release_metadata');
      return {
        version: normalizeVersion(payload?.version),
        publishedAt: normalizeReleaseDate(
          payload?.publishedAt ?? payload?.published_at ?? payload?.pubDate ?? payload?.pub_date ?? null,
        ),
        body: typeof payload?.body === 'string' ? payload.body : null,
      };
    } catch {
      // Fallback to frontend fetch flow when backend metadata command is unavailable.
    }
  }

  const [manifestResult, apiResult] = await Promise.allSettled([
    fetchLatestReleaseFromManifest(t),
    fetchLatestReleaseFromApi(t),
  ]);

  const manifest = manifestResult.status === 'fulfilled' ? manifestResult.value : null;
  const api = apiResult.status === 'fulfilled' ? apiResult.value : null;

  if (!manifest && !api) {
    throw new Error(t('update.metadataFailed'));
  }

  const version = normalizeVersion(manifest?.version || api?.version);

  return {
    version: version || null,
    publishedAt: manifest?.publishedAt || api?.publishedAt || null,
    body: api?.body || manifest?.body || null,
  };
};

export function UpdateProvider({ children }) {
  const { t } = useI18n();
  const [state, setState] = useState(DEFAULT_STATE);
  const updateRef = useRef(null);
  const currentVersionRef = useRef(null);

  const patchState = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const closePreviousUpdateHandle = useCallback(async () => {
    const previous = updateRef.current;
    updateRef.current = null;

    if (previous) {
      try {
        await previous.close();
      } catch {
        // ignore updater resource close failures
      }
    }
  }, []);

  const loadCurrentVersion = useCallback(async () => {
    if (!hasTauriRuntime()) {
      currentVersionRef.current = APP_VERSION;
      patchState({ currentVersion: APP_VERSION });
      return APP_VERSION;
    }

    try {
      const version = await invokeCommand('get_version');
      currentVersionRef.current = version;
      patchState({ currentVersion: version });
      return version;
    } catch {
      return null;
    }
  }, [patchState]);

  const checkForUpdates = useCallback(
    async ({ silent = false } = {}) => {
      patchState({ checking: true, errorMessage: null });
      let currentVersion = currentVersionRef.current;
      let latestRelease = null;

      try {
        currentVersion = currentVersion || (await loadCurrentVersion());

        if (!hasTauriRuntime()) {
          const previewVersion = currentVersion || APP_VERSION;

          patchState({
            checking: false,
            hasUpdate: false,
            latestVersion: previewVersion,
            currentVersion: previewVersion,
            releaseDate: null,
            releaseBody: null,
            progressPercent: 0,
            checkedAt: Date.now(),
            errorMessage: null,
          });

          return null;
        }

        latestRelease = await fetchLatestReleaseMetadata(t).catch(() => null);

        const update = await check();

        if (!update) {
          await closePreviousUpdateHandle();
          patchState({
            checking: false,
            hasUpdate: false,
            latestVersion: latestRelease?.version || currentVersion,
            currentVersion: currentVersion || APP_VERSION,
            ...buildReleaseDatePatch(latestRelease?.publishedAt),
            releaseBody: latestRelease?.body || null,
            progressPercent: 0,
            checkedAt: Date.now(),
          });

          if (!silent) {
            showSuccess(t('update.latest'));
          }

          return null;
        }

        await closePreviousUpdateHandle();
        updateRef.current = update;

        patchState({
          checking: false,
          hasUpdate: true,
          latestVersion: update.version,
          currentVersion: update.currentVersion,
          ...buildReleaseDatePatch(resolveReleaseDate(update.date, latestRelease?.publishedAt)),
          releaseBody: update.body || latestRelease?.body || null,
          progressPercent: 0,
          checkedAt: Date.now(),
        });

        if (!silent) {
          showSuccess(t('update.found', { version: update.version }));
        }

        return update;
      } catch (error) {
        const errorMessage = formatUpdaterError(error, { currentVersion, latestRelease, t });
        patchState({
          checking: false,
          hasUpdate: false,
          latestVersion: latestRelease?.version || currentVersion || APP_VERSION,
          currentVersion: currentVersion || APP_VERSION,
          ...buildReleaseDatePatch(latestRelease?.publishedAt),
          releaseBody: latestRelease?.body || null,
          progressPercent: 0,
          errorMessage,
          checkedAt: Date.now(),
        });

        if (!silent) {
          showError(t('update.checkFailed', { error: errorMessage }));
        }

        return null;
      }
    },
    [closePreviousUpdateHandle, loadCurrentVersion, patchState, t],
  );

  const installUpdate = useCallback(async () => {
    if (!hasTauriRuntime()) {
      showError(t('update.unsupported'));
      return false;
    }

    let update = updateRef.current;
    if (!update) {
      update = await checkForUpdates({ silent: true });
    }

    if (!update) {
      showSuccess(t('update.latest'));
      return false;
    }

    patchState({ downloading: true, errorMessage: null, progressPercent: 0 });

    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength || 0;
          downloadedBytes = 0;
          patchState({ progressPercent: 1 });
          return;
        }

        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            const percent = Math.max(1, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
            patchState({ progressPercent: percent });
          }
          return;
        }

        if (event.event === 'Finished') {
          patchState({ progressPercent: 100 });
        }
      });

      await closePreviousUpdateHandle();
      currentVersionRef.current = update.version;
      patchState({
        downloading: false,
        hasUpdate: false,
        currentVersion: update.version,
        latestVersion: update.version,
      });

      showSuccess(t('update.downloaded'));

      try {
        await relaunch();
      } catch {
        // On some platforms installer may close app by itself.
      }

      return true;
    } catch (error) {
      const readableError = formatUpdaterError(error, { t });
      patchState({
        downloading: false,
        errorMessage: readableError,
      });
      showError(t('update.installFailed', { error: readableError }));
      return false;
    }
  }, [checkForUpdates, closePreviousUpdateHandle, patchState, t]);

  useEffect(() => {
    let mounted = true;
    let checkTimer = null;

    const initialize = async () => {
      if (!mounted) {
        return;
      }
      await loadCurrentVersion();
      if (mounted) {
        checkTimer = window.setTimeout(() => {
          if (mounted) {
            void checkForUpdates({ silent: true });
          }
        }, 1200);
      }
    };

    void initialize();

    return () => {
      mounted = false;
      if (checkTimer) {
        window.clearTimeout(checkTimer);
      }
      void closePreviousUpdateHandle();
    };
  }, [checkForUpdates, closePreviousUpdateHandle, loadCurrentVersion]);

  const value = useMemo(
    () => ({
      ...state,
      checkForUpdates,
      installUpdate,
      supportsUpdater: hasTauriRuntime(),
    }),
    [state, checkForUpdates, installUpdate],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export const useUpdater = () => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdater must be used inside UpdateProvider');
  }
  return context;
};
