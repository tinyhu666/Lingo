import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAlt, Spinner } from '../../../icons';
import { useStore } from '../../../components/StoreProvider';
import {
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../../../constants/hotkeys';
import { invokeCommand, hasTauriRuntime } from '../../../services/tauriRuntime';
import { showError, showSuccess } from '../../../utils/toast';
import { toErrorMessage } from '../../../utils/error';
import { useI18n } from '../../../i18n/I18nProvider';

const formatPreview = (codes) =>
  codes
    .map((code) => {
      if (isModifierKeyCode(code)) {
        return formatModifierLabel(normalizeModifier(code));
      }
      return formatMainKeyLabel(code);
    })
    .join(' + ');

export default function HotkeyCard() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [capturedCodes, setCapturedCodes] = useState([]);

  const codesRef = useRef([]);
  const committingRef = useRef(false);

  const stopRecording = useCallback(() => {
    codesRef.current = [];
    setCapturedCodes([]);
    setRecording(false);
    committingRef.current = false;
  }, []);

  const commitHotkey = useCallback(async () => {
    if (committingRef.current) {
      return;
    }

    committingRef.current = true;
    const keys = [...codesRef.current];

    if (keys.length === 0) {
      stopRecording();
      return;
    }

    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('update_translator_shortcut', { keys });
        await syncSettings(latest);
        showSuccess(t('home.hotkey.setSuccess'));
      } else {
        const hotkey = buildHotkeyFromKeyCodes(keys);
        await updateSettings({ trans_hotkey: hotkey });
        showSuccess(t('home.hotkey.previewSuccess'));
      }
    } catch (error) {
      showError(t('home.hotkey.setFailed', { error: toErrorMessage(error) }));
    } finally {
      stopRecording();
    }
  }, [syncSettings, stopRecording, updateSettings, t]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopRecording();
        return;
      }

      const code = event.code;
      if (!code) {
        return;
      }

      if (codesRef.current.includes(code)) {
        return;
      }

      codesRef.current = [...codesRef.current, code];
      setCapturedCodes(codesRef.current);
    },
    [recording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      const hasMainKey = codesRef.current.some((code) => !isModifierKeyCode(code));
      if (!hasMainKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void commitHotkey();
    },
    [recording, commitHotkey],
  );

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [recording, handleKeyDown, handleKeyUp]);

  const beginRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    setRecording(true);
    codesRef.current = [];
    setCapturedCodes([]);
  };

  const hotkeyDisplay = useMemo(() => {
    if (recording && capturedCodes.length === 0) {
      return (
        <motion.div
          className='flex items-center justify-center'
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1 }}>
          <Spinner className='w-6 h-6 text-zinc-400' />
        </motion.div>
      );
    }

    if (recording) {
      return formatPreview(capturedCodes);
    }

    return settings?.trans_hotkey?.shortcut || defaultTranslatorHotkeyLabel();
  }, [recording, capturedCodes, settings?.trans_hotkey?.shortcut]);

  return (
    <motion.button
      type='button'
      onClick={beginRecording}
      className='home-stat-card dota-card tool-rise transition-all duration-200'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}>
      <div className='home-stat-card__header'>
        <span className='home-stat-card__icon-shell'>
          <KeyboardAlt className='home-stat-card__header-icon' />
        </span>
        <h3 className='home-stat-card__title'>{t('home.hotkey.title')}</h3>
      </div>

      <div className='home-stat-card__body'>
        <div className='home-top-copy home-stat-card__copy home-stat-card__copy--single'>
          <p className='tool-body'>
            {recording
              ? t('home.hotkey.recordingHint')
              : t('home.hotkey.defaultHint', { shortcut: defaultTranslatorHotkeyLabel() })}
          </p>
        </div>

        <div className='home-top-actions'>
          <div className='tool-control-slot home-top-control-slot'>
            <div className='home-top-control-shell'>
              <div className='home-top-control-frame flex items-center justify-center'>
                {typeof hotkeyDisplay === 'string' ? (
                  <span className='tool-control-text text-xl leading-none whitespace-nowrap overflow-hidden text-ellipsis'>
                    {hotkeyDisplay}
                  </span>
                ) : (
                  hotkeyDisplay
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}
