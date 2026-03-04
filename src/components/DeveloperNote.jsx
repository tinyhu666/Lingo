import { Coffee, Globe } from '../icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

export default function DeveloperNote() {
  const currentVersion = 'V1.2.0';

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
    <div className='ui-card flex flex-col rounded-2xl p-6'>
      <div className='flex items-center gap-3 mb-6'>
        <Coffee className='w-6 h-6 text-[#a8b6d7]' />
        <h3 className='ui-card-title'>项目说明</h3>
      </div>

      <div className='flex flex-col gap-4'>
        <div className='ui-card-title'>AutoGG {currentVersion}</div>
        <div className='ui-body'>powerby 萌新</div>
        <p className='ui-body'>
          AutoGG 专注 Dota2 游戏内剪贴板翻译：快捷键触发后自动复制、翻译并粘贴回当前输入框，支持 Win 与 macOS。
        </p>
        <p className='ui-body'>
          你的 API Key 保存在本地 `store.json`，不会上传到项目服务器。你可以按厂商分别填写配置并随时切换。
        </p>

        <button
          type='button'
          onClick={() => open('https://tauri.app')}
          className='ui-btn self-start flex items-center gap-2 px-4 ui-control-text'>
          <Globe className='w-4 h-4 text-[#a8b6d7]' />
          Tauri 文档
        </button>
      </div>
    </div>
  );
}
