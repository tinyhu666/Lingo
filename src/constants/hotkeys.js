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
    Shift: isMac ? '⇧' : 'Shift',
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
export const defaultIncomingChatHotkeyLabel = () => (detectMac() ? '⌘+E' : 'Alt+E');

export const defaultPhraseModifier = () => (detectMac() ? 'Meta' : 'Alt');

export const defaultPhraseModifierLabel = () => (detectMac() ? '⌥' : 'Alt');

export const buildHotkeyFromKeyCodes = (keyCodes) => {
  const modifiers = [...new Set(keyCodes.filter(isModifierKeyCode).map(normalizeModifier))].sort();
  const key = [...keyCodes].reverse().find((item) => !isModifierKeyCode(item));

  if (!modifiers.length || !key) {
    throw new Error('快捷键必须包含修饰键和主键');
  }

  return {
    modifiers,
    key,
    shortcut: `${modifiers.map(formatModifierLabel).join('+')}+${formatMainKeyLabel(key)}`,
  };
};
