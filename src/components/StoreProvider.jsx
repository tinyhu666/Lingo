import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadInitialSettings,
  readSettingsFromBackend,
  writePreviewSettings,
  writeSettingsToStore,
} from '../services/settingsStore';

const StoreContext = createContext(null);

const isEqualSettings = (a, b) => {
  if (Object.is(a, b)) {
    return true;
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestSettingsRef = useRef(null);
  const commitQueueRef = useRef(Promise.resolve());

  const enqueueCommit = useCallback((producer, { persist = true } = {}) => {
    const run = async () => {
      const currentSettings = latestSettingsRef.current || {};
      const nextSettings = producer(currentSettings) ?? currentSettings;
      if (isEqualSettings(currentSettings, nextSettings)) {
        return currentSettings;
      }

      latestSettingsRef.current = nextSettings;
      setSettings(nextSettings);

      try {
        if (persist) {
          await writeSettingsToStore(nextSettings);
        } else {
          writePreviewSettings(nextSettings);
        }

        return nextSettings;
      } catch (error) {
        latestSettingsRef.current = currentSettings;
        setSettings(currentSettings);
        throw error;
      }
    };

    commitQueueRef.current = commitQueueRef.current.then(run, run);
    return commitQueueRef.current;
  }, []);

  const replaceSettings = useCallback(
    async (nextSettings, options) => {
      const normalized = nextSettings || {};
      return enqueueCommit(() => normalized, options);
    },
    [enqueueCommit],
  );

  const syncSettings = useCallback(
    async (nextSettings) => {
      const normalized = nextSettings || {};
      latestSettingsRef.current = normalized;
      setSettings(normalized);
      writePreviewSettings(normalized);
      return normalized;
    },
    [],
  );

  const updateSettings = useCallback(
    async (patchOrUpdater) => {
      return enqueueCommit((current) => ({
        ...current,
        ...(typeof patchOrUpdater === 'function' ? patchOrUpdater(current || {}) : (patchOrUpdater || {})),
      }));
    },
    [enqueueCommit],
  );

  const reloadSettings = useCallback(async () => {
    const latestFromBackend = await readSettingsFromBackend();
    if (!latestFromBackend) {
      return latestSettingsRef.current;
    }

    await syncSettings(latestFromBackend);
    return latestFromBackend;
  }, [syncSettings]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const initial = await loadInitialSettings();
        if (!mounted) {
          return;
        }
        latestSettingsRef.current = initial;
        setSettings(initial);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      settings,
      loading,
      updateSettings,
      replaceSettings,
      syncSettings,
      reloadSettings,
      // 兼容旧代码结构，避免其他页面读取 store 字段时报错
      store: null,
    }),
    [settings, loading, updateSettings, replaceSettings, syncSettings, reloadSettings],
  );

  return <StoreContext.Provider value={contextValue}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore 必须在 StoreProvider 内部使用');
  }
  return context;
};
