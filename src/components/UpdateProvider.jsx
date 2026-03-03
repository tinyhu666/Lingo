import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { invokeCommand } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';

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

export function UpdateProvider({ children }) {
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
      return null;
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
      if (!hasTauriRuntime()) {
        patchState({
          checking: false,
          hasUpdate: false,
          errorMessage: '当前为预览环境，无法检查更新。',
          checkedAt: Date.now(),
        });
        if (!silent) {
          showError('当前为预览环境，无法检查更新');
        }
        return null;
      }

      patchState({ checking: true, errorMessage: null });

      try {
        const currentVersion = currentVersionRef.current || (await loadCurrentVersion());
        const update = await check();

        if (!update) {
          await closePreviousUpdateHandle();
          patchState({
            checking: false,
            hasUpdate: false,
            latestVersion: currentVersion,
            releaseDate: null,
            releaseBody: null,
            progressPercent: 0,
            checkedAt: Date.now(),
          });

          if (!silent) {
            showSuccess('当前已是最新版本');
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
          releaseDate: update.date || null,
          releaseBody: update.body || null,
          progressPercent: 0,
          checkedAt: Date.now(),
        });

        if (!silent) {
          showSuccess(`发现新版本 v${update.version}`);
        }

        return update;
      } catch (error) {
        patchState({
          checking: false,
          hasUpdate: false,
          errorMessage: String(error),
          checkedAt: Date.now(),
        });

        if (!silent) {
          showError(`检查更新失败: ${error}`);
        }

        return null;
      }
    },
    [closePreviousUpdateHandle, loadCurrentVersion, patchState],
  );

  const installUpdate = useCallback(async () => {
    if (!hasTauriRuntime()) {
      showError('当前环境不支持自动更新');
      return false;
    }

    let update = updateRef.current;
    if (!update) {
      update = await checkForUpdates({ silent: true });
    }

    if (!update) {
      showSuccess('当前已是最新版本');
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

      showSuccess('更新已下载完成，应用即将重启安装');

      try {
        await relaunch();
      } catch {
        // On some platforms installer may close app by itself.
      }

      return true;
    } catch (error) {
      patchState({
        downloading: false,
        errorMessage: String(error),
      });
      showError(`更新安装失败: ${error}`);
      return false;
    }
  }, [checkForUpdates, closePreviousUpdateHandle, patchState]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!mounted) {
        return;
      }
      await loadCurrentVersion();
      if (mounted) {
        await checkForUpdates({ silent: true });
      }
    };

    void initialize();

    return () => {
      mounted = false;
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
    throw new Error('useUpdater 必须在 UpdateProvider 内使用');
  }
  return context;
};
