import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  parseUpdaterPublicKey,
  parseUpdaterSignature,
  verifyUpdaterSigningKey,
} from './verify-updater-signing-key.mjs';

const LEGACY_KEY_ID = 'F8A6813CC106A04E';
const CURRENT_KEY_ID = '56B21F223CBD21D5';

const rawKeyId = (keyId) => Buffer.from(keyId, 'hex').reverse();
const outerBase64 = (text) => Buffer.from(text, 'utf8').toString('base64');

const publicKey = (keyId) => {
  const record = Buffer.alloc(42);
  record.write('Ed', 0, 'ascii');
  rawKeyId(keyId).copy(record, 2);
  return outerBase64(
    `untrusted comment: minisign public key: ${keyId}\n${record.toString('base64')}\n`,
  );
};

const signature = (keyId) => {
  const record = Buffer.alloc(74);
  record.write('ED', 0, 'ascii');
  rawKeyId(keyId).copy(record, 2);
  const globalSignature = Buffer.alloc(74).toString('base64');
  return outerBase64(
    `untrusted comment: signature from tauri secret key\n${record.toString('base64')}\ntrusted comment: timestamp:1\tfile:probe\n${globalSignature}\n`,
  );
};

test('parses updater public key and signature key IDs', () => {
  assert.equal(parseUpdaterPublicKey(publicKey(CURRENT_KEY_ID)), CURRENT_KEY_ID);
  assert.equal(parseUpdaterSignature(signature(CURRENT_KEY_ID)), CURRENT_KEY_ID);
});

test('accepts a signature only when the public and expected key IDs match', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingo-updater-key-test-'));
  const signaturePath = join(directory, 'probe.sig');
  const publicKeyPath = join(directory, 'updater.key.pub');
  writeFileSync(signaturePath, signature(LEGACY_KEY_ID));
  writeFileSync(publicKeyPath, publicKey(LEGACY_KEY_ID));

  assert.equal(
    verifyUpdaterSigningKey(signaturePath, publicKeyPath, LEGACY_KEY_ID),
    LEGACY_KEY_ID,
  );
  assert.throws(
    () => verifyUpdaterSigningKey(signaturePath, publicKeyPath, CURRENT_KEY_ID),
    /does not match expected key/,
  );
});

test('rejects a signature made by a different key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingo-updater-key-test-'));
  const signaturePath = join(directory, 'probe.sig');
  const publicKeyPath = join(directory, 'updater.key.pub');
  writeFileSync(signaturePath, signature(LEGACY_KEY_ID));
  writeFileSync(publicKeyPath, publicKey(CURRENT_KEY_ID));

  assert.throws(
    () => verifyUpdaterSigningKey(signaturePath, publicKeyPath),
    /does not match public key/,
  );
});
