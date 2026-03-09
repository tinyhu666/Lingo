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
  const { settings, updateSettings, replaceSettings } = useStore();
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
        await invokeCommand('update_translator_shortcut', { keys });
        const latest = await invokeCommand('get_settings');
        await replaceSettings(latest);
        showSuccess('翻译快捷键设置成功');
      } else {
        const hotkey = buildHotkeyFromKeyCodes(keys);
        await updateSettings({ trans_hotkey: hotkey });
        showSuccess('预览模式：快捷键显示已更新');
      }
    } catch (error) {
      showError(`翻译快捷键设置失败: ${error}`);
    } finally {
      stopRecording();
    }
  }, [replaceSettings, stopRecording, updateSettings]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

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
      className='dota-card w-full min-h-[248px] flex-1 flex flex-col rounded-2xl px-6 pt-6 pb-3 text-left transition-all duration-200 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}>
      <div className='flex items-center gap-3'>
        <KeyboardAlt className='w-6 h-6 stroke-zinc-500' />
        <h3 className='tool-card-title'>快捷键</h3>
      </div>

      <div className='flex-1 flex flex-col mt-4'>
        <div className='home-top-copy'>
          <p className='tool-body'>
            {recording
              ? '按下组合键，松开任意键完成设置。'
              : `点击此卡片设置快捷键（默认 ${defaultTranslatorHotkeyLabel()}）。`}
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
