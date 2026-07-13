import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, messages } from './messages.js';

function flatten(source, prefix = '') {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flatten(value, path);
    }
    return [[path, value]];
  });
}

test('every supported locale provides the same non-empty message keys', () => {
  const expected = new Map(flatten(messages[DEFAULT_LOCALE]));
  assert.ok(expected.size > 0);

  for (const locale of SUPPORTED_LOCALES) {
    const actual = new Map(flatten(messages[locale]));
    assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), locale);
    for (const [key, value] of actual) {
      assert.equal(typeof value, 'string', `${locale}:${key}`);
      assert.ok(value.trim(), `${locale}:${key}`);
    }
  }
});
