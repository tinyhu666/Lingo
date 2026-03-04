import { Coffee, Globe } from '../icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

export default function DeveloperNote() {
  const currentVersion = 'V0.1.8';

  const open = async (url) => {
    try {
      if (hasTauriRuntime()) {
        await openUrl(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      showError(`打开链接失败: ${error}`);
    }
  };

  return (
    <div className='dota-card flex flex-col rounded-2xl p-6'>
      <div className='flex items-center gap-3 text-sm text-zinc-500 mb-6'>
        <Coffee className='w-6 h-6 stroke-zinc-500' />
        项目说明
      </div>

      <div className='flex flex-col gap-4 text-zinc-600'>
        <div className='text-lg font-medium text-zinc-900'>AutoGG {currentVersion}</div>
        <div className='text-sm text-zinc-500'>powerby 萌新</div>
        <p className='leading-relaxed'>
          AutoGG 专注 Dota2 游戏内剪贴板翻译：快捷键触发后自动复制、翻译并粘贴回当前输入框，支持 Win 与 macOS。
        </p>
        <p className='leading-relaxed'>
          你的 API Key 保存在本地 `store.json`，不会上传到项目服务器。你可以按厂商分别填写配置并随时切换。
        </p>

        <button
          type='button'
          onClick={() => open('https://tauri.app')}
          className='tool-btn self-start flex items-center gap-2 px-4 py-2 text-sm'>
          <Globe className='w-4 h-4 stroke-zinc-500' />
          Tauri 文档
        </button>
      </div>
    </div>
  );
}
