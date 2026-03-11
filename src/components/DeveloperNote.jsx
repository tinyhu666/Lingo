import { Coffee, Globe } from '../icons';
import { APP_VERSION_LABEL } from '../constants/version';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import { useI18n } from '../i18n/I18nProvider';

export default function DeveloperNote() {
  const { t } = useI18n();
  const currentVersion = APP_VERSION_LABEL;

  const open = async (url) => {
    try {
      if (hasTauriRuntime()) {
        await openUrl(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      showError(t('developerNote.openLinkFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <div className='dota-card tool-rise flex h-full flex-col p-6'>
      <div className='flex items-center gap-3'>
        <Coffee className='h-5 w-5 stroke-zinc-500' />
        <h3 className='tool-card-title'>{t('developerNote.title')}</h3>
      </div>

      <div className='mt-5 flex flex-1 flex-col gap-4'>
        <div className='tool-subcard p-4'>
          <div className='tool-caption'>{t('developerNote.version')}</div>
          <div className='tool-card-title mt-2'>Lingo {currentVersion}</div>
          <div className='tool-body mt-2'>{t('common.poweredBy')}</div>
        </div>

        <div className='tool-subcard p-4'>
          <div className='tool-caption'>{t('developerNote.position')}</div>
          <p className='tool-body mt-2'>{t('developerNote.positionBody')}</p>
        </div>

        <div className='tool-subcard p-4'>
          <div className='tool-caption'>{t('developerNote.architecture')}</div>
          <p className='tool-body mt-2'>{t('developerNote.architectureBody')}</p>
        </div>

        <button
          type='button'
          onClick={() => open('https://tauri.app')}
          className='tool-btn mt-auto self-start gap-2 px-4 tool-control-text'>
          <Globe className='h-4 w-4 stroke-zinc-500' />
          {t('developerNote.tauriDocs')}
        </button>
      </div>
    </div>
  );
}
