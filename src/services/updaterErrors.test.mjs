import assert from 'node:assert/strict';
import test from 'node:test';
import { getUpdaterErrorMessage, isUpdaterKeyMismatch } from './updaterErrors.js';

test('recognizes the Tauri signature-key mismatch shown by released clients', () => {
  assert.equal(
    isUpdaterKeyMismatch('The signature was created with a different key than the one provided'),
    true,
  );
  assert.equal(isUpdaterKeyMismatch(new Error('UnexpectedKeyId')), true);
  assert.equal(isUpdaterKeyMismatch('updater key id does not match'), true);
});

test('does not classify unrelated updater failures as key mismatches', () => {
  assert.equal(isUpdaterKeyMismatch(new Error('Download request failed with status: 503')), false);
  assert.equal(getUpdaterErrorMessage(null, 'Unknown error'), 'Unknown error');
});
