import { useEffect } from 'react';
import Sidebar from './Sidebar';
import { StoreProvider } from './StoreProvider';
import { UpdateProvider } from './UpdateProvider';
import { Toaster } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

export default function Layout({ children, activeItem, setActiveItem }) {
    useEffect(() => {
        if (!hasTauriRuntime()) {
            return undefined;
        }

        let unlisten = null;

        const bind = async () => {
            unlisten = await listen('translation_failed', (event) => {
                const message =
                    typeof event.payload === 'string' && event.payload.trim()
                        ? event.payload
                        : '翻译失败，请检查服务配置或稍后重试。';
                showError(message);
            });
        };

        void bind();

        return () => {
            if (typeof unlisten === 'function') {
                unlisten();
            }
        };
    }, []);

    return (
        <StoreProvider>
            <UpdateProvider>
                <div className="flex h-screen overflow-hidden p-4">
                    {/* Toast 容器 */}
                    <Toaster
                        toastOptions={{
                            className: 'text-sm',
                            style: {
                                borderRadius: '10px',
                                background: '#ffffff',
                                color: '#1f2937',
                                border: '1px solid #d7dde6',
                                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
                            },
                        }}
                    />

                    <div className="dota-shell flex w-full rounded-[20px] overflow-hidden">
                        {/* 左侧固定宽度的侧边栏 */}
                        <div className="w-[220px] h-full">
                            <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
                        </div>

                        {/* 右侧内容区域 */}
                        <div className="flex-1 p-5">
                            <div className="dota-main-panel max-w-[1240px] mx-auto h-[calc(100vh-68px)] rounded-[18px] p-6 overflow-auto">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </UpdateProvider>
        </StoreProvider>
    );
}
