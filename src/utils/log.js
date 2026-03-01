import { invoke } from '@tauri-apps/api/core';

const hasTauriInvoke = () =>
    typeof window !== 'undefined' &&
    typeof window.__TAURI_INTERNALS__ !== 'undefined' &&
    typeof window.__TAURI_INTERNALS__.invoke === 'function';

const sendBackendLog = async (message) => {
    if (!hasTauriInvoke()) {
        return;
    }
    try {
        await invoke('log_to_backend', { message });
    } catch (error) {
        console.debug('后端日志上报失败:', error);
    }
};

/**
 * 统一的日志工具函数
 * 将日志同时输出到浏览器控制台和后端
 * @param {...any} args - 要记录的参数
 */
export const log = (...args) => {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    console.log(...args); // 保持浏览器控制台的输出
    void sendBackendLog(message);
};

/**
 * 错误日志工具函数
 * @param {...any} args - 要记录的参数
 */
export const logError = (...args) => {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    console.error(...args); // 保持浏览器控制台的输出
    void sendBackendLog(`[ERROR] ${message}`);
}; 
