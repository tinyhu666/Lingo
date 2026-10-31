import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTranslatedText } from './translation-output.mjs';

test('labels, wrapping quotes and newlines are removed from model output', () => {
  assert.equal(sanitizeTranslatedText('"group up, let\'s do rosh"'), "group up, let's do rosh");
  assert.equal(sanitizeTranslatedText('Translation: care mid'), 'care mid');
  assert.equal(sanitizeTranslatedText('译文：小心中路'), '小心中路');
  assert.equal(sanitizeTranslatedText('“等我，BKB还要30秒”'), '等我，BKB还要30秒');
  assert.equal(sanitizeTranslatedText('push top\nafter this'), 'push top after this');
  assert.equal(sanitizeTranslatedText('<think>reasoning</think>\ngo rosh'), 'go rosh');
  assert.equal(sanitizeTranslatedText('  wait   for me '), 'wait for me');
});

test('quotes that belong to the message are kept', () => {
  assert.equal(sanitizeTranslatedText('he said "gg" and left'), 'he said "gg" and left');
  assert.equal(sanitizeTranslatedText('"wait" is not "go"'), '"wait" is not "go"');
  assert.equal(sanitizeTranslatedText('"'), '"');
});

test('empty and plain text pass through unchanged', () => {
  assert.equal(sanitizeTranslatedText(''), '');
  assert.equal(sanitizeTranslatedText(null), '');
  assert.equal(sanitizeTranslatedText('gank mid, jungler'), 'gank mid, jungler');
});
