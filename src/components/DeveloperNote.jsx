import { Coffee, Globe } from '../icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

export default function DeveloperNote() {
  const currentVersion = 'V0.2.5';

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
      <div className='flex items-center gap-3 mb-6'>
        <Coffee className='w-6 h-6 stroke-zinc-500' />
        <h3 className='tool-card-title'>项目说明</h3>
      </div>

      <div className='flex flex-col gap-4 text-zinc-600'>
        <div className='tool-card-title'>Lingo {currentVersion}</div>
        <div className='tool-body'>powerby 萌新</div>
        <p className='tool-body'>
          Lingo 专注游戏内剪贴板翻译：快捷键触发后自动复制、翻译并粘贴回当前输入框，支持 Win 与 macOS。
        </p>
        <p className='tool-body'>翻译模型参数由服务端统一维护，无需登录账号与手动配置 API。</p>

        <button
          type='button'
          onClick={() => open('https://tauri.app')}
          className='tool-btn self-start gap-2 px-4 tool-control-text'>
          <Globe className='w-4 h-4 stroke-zinc-500' />
          Tauri 文档
        </button>
      </div>
    </div>
  );
}
