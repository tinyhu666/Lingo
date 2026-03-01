import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyboardAlt, Spinner } from '../../../icons';
import { useStore } from '../../../components/StoreProvider';
import { showError, showSuccess } from '../../../utils/toast';
import { log, logError } from '../../../utils/log';

const MODIFIER_CODES = ['Control', 'Alt', 'Shift', 'Meta'];

const isMac = () => {
  return navigator.userAgent.toLowerCase().includes('mac');
};

const hasTauriInvoke = () =>
  typeof window !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__ !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__.invoke === 'function';

const getDefaultHotkey = () => (isMac() ? '⌘+T' : 'Alt+T');

const isModifierCode = (keyCode) => MODIFIER_CODES.some((code) => keyCode.includes(code));

const normalizeModifierCode = (keyCode) => keyCode.replace('Left', '').replace('Right', '');

const formatModifier = (key) => {
  const modifierMap = {
    Control: isMac() ? '⌃' : 'Ctrl',
    Alt: isMac() ? '⌥' : 'Alt',
    Shift: '⇧',
    Meta: isMac() ? '⌘' : 'Win',
  };
  return modifierMap[key] || key;
};

const formatMainKey = (keyCode) => {
  if (!keyCode) return '?';
  return keyCode.replace('Key', '').replace('Digit', '');
};

const buildLocalHotkey = (keys) => {
  const modifiers = [...new Set(keys.filter(isModifierCode).map(normalizeModifierCode))].sort();
  const key = [...keys].reverse().find((item) => !isModifierCode(item));

  if (!modifiers.length || !key) {
    throw new Error('快捷键必须包含修饰键和一个主键');
  }

  const modifierText = modifiers.map(formatModifier).join('+');
  return {
    modifiers,
    key,
    shortcut: `${modifierText}+${formatMainKey(key)}`,
  };
};

const getKeyName = (e) => {
  return e.code;
};

export default function HotkeyCard() {
  const [isRecording, setIsRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState([]);
  const { settings, updateSettings } = useStore();

  const handleKeyDown = (e) => {
    e.preventDefault();
    const keyName = getKeyName(e);
    log('按键按下，keyName:', keyName);
    setPressedKeys((prev) => {
      const newKeys = !prev.includes(keyName) ? [...prev, keyName] : prev;
      log('当前记录的按键数组:', newKeys);
      return newKeys;
    });
  };

  const cleanupRecording = () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    setIsRecording(false);
    setPressedKeys([]);
  };

  const handleKeyUp = async (e) => {
    e.preventDefault();
    log('键盘松开事件触发');

    const keys = await new Promise((resolve) => {
      setPressedKeys((currentKeys) => {
        if (currentKeys.length === 0) {
          resolve([]);
          return currentKeys;
        }
        resolve([...currentKeys]);
        return currentKeys;
      });
    });

    if (keys.length === 0) {
      cleanupRecording();
      return;
    }

    try {
      showSuccess('更新快捷键...');

      if (hasTauriInvoke()) {
        await invoke('update_translator_shortcut', { keys });
        const updatedSettings = await invoke('get_settings');
        await updateSettings(updatedSettings);
        showSuccess('翻译快捷键设置成功');
      } else {
        const localHotkey = buildLocalHotkey(keys);
        await updateSettings({ trans_hotkey: localHotkey });
        showSuccess('预览模式：快捷键显示已更新');
      }
    } catch (err) {
      logError('快捷键更新失败:', err);
      showError(`翻译快捷键设置失败: ${err}`);
    } finally {
      cleanupRecording();
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setPressedKeys([]);
  };

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [isRecording]);

  const getCurrentHotkeyDisplay = () => {
    if (isRecording) {
      if (pressedKeys.length === 0) {
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

      return pressedKeys
        .map((key) => {
          if (isModifierCode(key)) {
            return formatModifier(normalizeModifierCode(key));
          }
          return formatMainKey(key);
        })
        .join(' + ');
    }

    return settings?.trans_hotkey?.shortcut || getDefaultHotkey();
  };

  return (
    <motion.button
      onClick={startRecording}
      className='dota-card w-full h-full min-h-[248px] flex flex-col rounded-2xl p-6 transition-all duration-200 text-left hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}>
      <div className='flex items-center gap-3 text-sm text-zinc-500'>
        <KeyboardAlt className='w-6 h-6 stroke-zinc-500' />
        快捷键
      </div>
      <div className='flex-1 flex flex-col justify-between mt-4'>
        <div className='text-sm text-zinc-400'>
          {isRecording
            ? '按下组合键，松开任意键完成设置。'
            : `点击此卡片设置快捷键（默认 ${getDefaultHotkey()}）。`}
        </div>
        <div className='text-2xl font-semibold text-zinc-900 flex items-center gap-2'>
          {getCurrentHotkeyDisplay()}
        </div>
      </div>
    </motion.button>
  );
}
