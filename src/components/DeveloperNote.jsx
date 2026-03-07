import { Coffee, Globe } from '../icons';
import { APP_VERSION_LABEL } from '../constants/version';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';

export default function DeveloperNote() {
  const currentVersion = APP_VERSION_LABEL;

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
    <div className='dota-card tool-rise flex h-full flex-col p-6'>
      <div className='flex items-center gap-3'>
        <Coffee className='h-5 w-5 stroke-zinc-500' />
        <h3 className='tool-card-title'>项目说明</h3>
      </div>

      <div className='mt-5 flex flex-1 flex-col gap-4'>
        <div className='tool-subcard p-4'>
          <div className='tool-caption'>版本</div>
          <div className='tool-card-title mt-2'>Lingo {currentVersion}</div>
          <div className='tool-body mt-2'>powerby 萌新</div>
        </div>

        <div className='tool-subcard p-4'>
          <div className='tool-caption'>定位</div>
          <p className='tool-body mt-2'>Lingo 专注游戏内剪贴板翻译：快捷键触发后自动复制、翻译并粘贴回当前输入框，支持 Win 与 macOS。</p>
        </div>

        <div className='tool-subcard p-4'>
          <div className='tool-caption'>架构</div>
          <p className='tool-body mt-2'>翻译模型参数由服务端统一维护，客户端无需登录账号，也无需手动填写模型 API。</p>
        </div>

        <button
          type='button'
          onClick={() => open('https://tauri.app')}
          className='tool-btn mt-auto self-start gap-2 px-4 tool-control-text'>
          <Globe className='h-4 w-4 stroke-zinc-500' />
          Tauri 文档
        </button>
      </div>
    </div>
  );
}
