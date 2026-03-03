import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadInitialSettings,
  readSettingsFromBackend,
  writePreviewSettings,
  writeSettingsToStore,
} from '../services/settingsStore';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestSettingsRef = useRef(null);
  const commitQueueRef = useRef(Promise.resolve());

  const enqueueCommit = useCallback((producer) => {
    const run = async () => {
      const nextSettings = producer(latestSettingsRef.current || {});
      latestSettingsRef.current = nextSettings;
      setSettings(nextSettings);
      await writeSettingsToStore(nextSettings);
      writePreviewSettings(nextSettings);
      return nextSettings;
    };

    commitQueueRef.current = commitQueueRef.current.then(run, run);
    return commitQueueRef.current;
  }, []);

  const replaceSettings = useCallback(
    async (nextSettings) => {
      const normalized = nextSettings || {};
      return enqueueCommit(() => normalized);
    },
    [enqueueCommit],
  );

  const updateSettings = useCallback(
    async (patch) => {
      return enqueueCommit((current) => ({
        ...current,
        ...(patch || {}),
      }));
    },
    [enqueueCommit],
  );

  const reloadSettings = useCallback(async () => {
    const latestFromBackend = await readSettingsFromBackend();
    if (!latestFromBackend) {
      return latestSettingsRef.current;
    }

    await replaceSettings(latestFromBackend);
    return latestFromBackend;
  }, [replaceSettings]);

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
      reloadSettings,
      // 兼容旧代码结构，避免其他页面读取 store 字段时报错
      store: null,
    }),
    [settings, loading, updateSettings, replaceSettings, reloadSettings],
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
