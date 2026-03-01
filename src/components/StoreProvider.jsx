import { createContext, useContext, useState, useEffect } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

const StoreContext = createContext(null);
const WEB_SETTINGS_KEY = 'autogg.settings';

export function StoreProvider({ children }) {
    const [store, setStore] = useState(null);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initStore = async () => {
            try {
                const storeInstance = await load('store.json', {
                    autoSave: 100
                });
                setStore(storeInstance);
                try {
                    const latestSettings = await invoke('get_settings');
                    setSettings(latestSettings);
                } catch (error) {
                    const storedSettings = await storeInstance.get('settings');
                    if (storedSettings) {
                        setSettings(storedSettings);
                    }
                }
            } catch (error) {
                // 浏览器预览环境下 tauri store 不可用，使用本地存储兜底
                try {
                    const fallback = localStorage.getItem(WEB_SETTINGS_KEY);
                    if (fallback) {
                        setSettings(JSON.parse(fallback));
                    }
                } catch (fallbackError) {
                    console.error('读取本地预览设置失败:', fallbackError);
                }
            } finally {
                setLoading(false);
            }
        };
        initStore();
    }, []);

    const updateSettings = async (newSettings) => {
        const updatedSettings = { ...(settings || {}), ...newSettings };

        if (!store) {
            setSettings(updatedSettings);
            try {
                localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(updatedSettings));
            } catch (error) {
                console.error('写入本地预览设置失败:', error);
            }
            return;
        }

        try {
            await store.set('settings', updatedSettings);
            await store.save();
            const storedSettings = await store.get('settings');
            if (storedSettings) {
                setSettings(storedSettings);
            }
        } catch (error) {
            console.error('更新设置失败:', error);
            // 即使持久化失败，也保持当前会话可用
            setSettings(updatedSettings);
        }
    };

    return (
        <StoreContext.Provider value={{ store, settings, updateSettings, loading }}>
            {children}
        </StoreContext.Provider>
    );
}

export const useStore = () => {
    const context = useContext(StoreContext);
    if (!context) {
        throw new Error('useStore 必须在 StoreProvider 内部使用');
    }
    return context;
}; 
