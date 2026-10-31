const MODIFIER_CODES = new Set(['Control', 'Alt', 'Shift', 'Meta']);

export const detectMac = () =>
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');

export const normalizeModifier = (value) => value.replace('Left', '').replace('Right', '');

export const isModifierKeyCode = (code) => MODIFIER_CODES.has(normalizeModifier(code));

export const formatModifierLabel = (key) => {
  const value = normalizeModifier(key);
  const isMac = detectMac();
  const labelMap = {
    Control: isMac ? '⌃' : 'Ctrl',
    Alt: isMac ? '⌥' : 'Alt',
    Shift: '⇧',
    Meta: isMac ? '⌘' : 'Win',
  };
  return labelMap[value] || value;
};

export const formatMainKeyLabel = (keyCode = '') => {
  if (!keyCode) {
    return '?';
  }
  return keyCode.replace('Key', '').replace('Digit', '');
};

export const defaultTranslatorHotkeyLabel = () => (detectMac() ? '⌘+T' : 'Alt+T');

export const defaultTranslatorHotkeyCodes = () => (detectMac() ? ['Meta', 'KeyT'] : ['Alt', 'KeyT']);

export const defaultIncomingToggleHotkeyLabel = () =>
  detectMac() ? '⌘+⇧+T' : 'Alt+⇧+T';

export const defaultIncomingClickThroughHotkeyLabel = () =>
  detectMac() ? '⌘+⌥+L' : 'Ctrl+Alt+L';

export const defaultPhraseModifier = () => (detectMac() ? 'Meta' : 'Alt');

export const defaultPhraseModifierLabel = () => (detectMac() ? '⌘' : 'Alt');

/**
 * Human-readable key labels for the stored translator hotkey, falling back to
 * the platform default when nothing is stored yet.
 */
export const hotkeyLabelsFromSettings = (settings) => {
  const storedHotkey = settings?.trans_hotkey;
  if (storedHotkey?.key) {
    const labels = [
      ...(storedHotkey.modifiers || []).map((m) => formatModifierLabel(normalizeModifier(m))),
      formatMainKeyLabel(storedHotkey.key),
    ].filter(Boolean);
    if (labels.length > 0) {
      return labels;
    }
  }
  return defaultTranslatorHotkeyLabel().split('+');
};

export const buildHotkeyFromKeyCodes = (keyCodes) => {
  const modifiers = [...new Set(keyCodes.filter(isModifierKeyCode).map(normalizeModifier))].sort();
  const mainKeys = [...new Set(keyCodes.filter((item) => !isModifierKeyCode(item)))];
  const key = mainKeys[0];

  if (!modifiers.length || !key || mainKeys.length !== 1) {
    throw new Error('Hotkey must include at least one modifier and one main key');
  }

  return {
    modifiers,
    key,
    shortcut: `${modifiers.map(formatModifierLabel).join('+')}+${formatMainKeyLabel(key)}`,
  };
};
