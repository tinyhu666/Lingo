import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { verifyAssetSignature } from './verify-release-assets.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const id = Buffer.from('0102030405060708', 'hex');
const keyRecord = Buffer.concat([Buffer.from('Ed'), id, publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)]);
const encodedKey = Buffer.from(`untrusted comment: minisign public key: 0807060504030201\n${keyRecord.toString('base64')}\n`).toString('base64');
const data = Buffer.from('installer payload');
const signature = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
const comment = 'timestamp:1\tfile:installer\tprehashed';
const globalSignature = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
const envelope = `untrusted comment: test\n${Buffer.concat([Buffer.from('ED'), id, signature]).toString('base64')}\ntrusted comment: ${comment}\n${globalSignature.toString('base64')}\n`;
const encoded = Buffer.from(envelope).toString('base64');

test('valid prehashed artifact and trusted comment signatures pass', () => {
  verifyAssetSignature(data, encoded, encodedKey);
});
test('tampered artifact fails cryptographic verification', () => {
  assert.throws(() => verifyAssetSignature(Buffer.from('altered'), encoded, encodedKey), /Invalid artifact signature/);
});
test('tampered trusted comment fails cryptographic verification', () => {
  const tampered = Buffer.from(envelope.replace('timestamp:1', 'timestamp:2')).toString('base64');
  assert.throws(() => verifyAssetSignature(data, tampered, encodedKey), /Invalid trusted comment signature/);
});
