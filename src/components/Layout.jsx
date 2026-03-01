import Sidebar from './Sidebar';
import { StoreProvider } from './StoreProvider';
import { Toaster } from 'react-hot-toast';

export default function Layout({ children, activeItem, setActiveItem }) {
    return (
        <StoreProvider>
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
        </StoreProvider>
    );
}
