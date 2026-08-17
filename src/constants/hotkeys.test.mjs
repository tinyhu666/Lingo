import assert from 'node:assert/strict';
import test from 'node:test';

const originalNavigator = globalThis.navigator;

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Windows NT 10.0' },
});

const {
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyCodes,
  formatMainKeyLabel,
  normalizeModifier,
} = await import('./hotkeys.js');

test.after(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
});

test('builds one modifier plus one main key', () => {
  assert.deepEqual(buildHotkeyFromKeyCodes(['AltLeft', 'KeyT']), {
    modifiers: ['Alt'],
    key: 'KeyT',
    shortcut: 'Alt+T',
  });
});

test('rejects shortcuts without a modifier', () => {
  assert.throws(() => buildHotkeyFromKeyCodes(['KeyT']), /modifier/);
});

test('rejects shortcuts with more than one main key', () => {
  assert.throws(() => buildHotkeyFromKeyCodes(['AltLeft', 'KeyT', 'KeyY']), /modifier/);
});

test('provides the Windows default translator shortcut codes', () => {
  assert.deepEqual(defaultTranslatorHotkeyCodes(), ['Alt', 'KeyT']);
});

test('normalizes labels used by the recorder', () => {
  assert.equal(normalizeModifier('ControlLeft'), 'Control');
  assert.equal(formatMainKeyLabel('Digit1'), '1');
});
