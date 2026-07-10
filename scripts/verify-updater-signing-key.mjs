import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const KEY_ID_PATTERN = /^[0-9A-F]{16}$/;

const decodeBase64 = (value, label) => {
  const compact = value.replace(/\s/g, '');
  if (!compact || !BASE64_PATTERN.test(compact) || compact.length % 4 !== 0) {
    throw new Error(`${label} is not valid base64`);
  }

  const decoded = Buffer.from(compact, 'base64');
  if (decoded.toString('base64') !== compact) {
    throw new Error(`${label} is not canonical base64`);
  }
  return decoded;
};

const decodeEnvelope = (encoded, label) =>
  decodeBase64(encoded.trim(), label).toString('utf8').trimEnd().split(/\r?\n/);

const formatKeyId = (record) =>
  Buffer.from(record.subarray(2, 10)).reverse().toString('hex').toUpperCase();

export const parseUpdaterPublicKey = (encoded, label = 'updater public key') => {
  const lines = decodeEnvelope(encoded, label);
  if (lines.length !== 2) {
    throw new Error(`${label} must contain a two-line minisign public key`);
  }

  const commentKeyId = lines[0].match(
    /^untrusted comment: minisign public key: ([0-9A-F]{16})$/,
  )?.[1];
  if (!commentKeyId) {
    throw new Error(`${label} has an invalid minisign comment`);
  }

  const record = decodeBase64(lines[1], `${label} record`);
  if (record.length !== 42 || record.subarray(0, 2).toString('ascii') !== 'Ed') {
    throw new Error(`${label} has an invalid minisign key record`);
  }

  const recordKeyId = formatKeyId(record);
  if (recordKeyId !== commentKeyId) {
    throw new Error(`${label} comment and key record IDs do not match`);
  }
  return recordKeyId;
};

export const parseUpdaterSignature = (encoded, label = 'updater signature') => {
  const lines = decodeEnvelope(encoded, label);
  if (
    lines.length !== 4 ||
    !lines[0].startsWith('untrusted comment:') ||
    !lines[2].startsWith('trusted comment:')
  ) {
    throw new Error(`${label} has an invalid minisign signature envelope`);
  }

  const record = decodeBase64(lines[1], `${label} record`);
  if (record.length !== 74 || record.subarray(0, 2).toString('ascii') !== 'ED') {
    throw new Error(`${label} has an invalid minisign signature record`);
  }
  return formatKeyId(record);
};

export const verifyUpdaterSigningKey = (
  signaturePath,
  publicKeyPath,
  expectedKeyId,
) => {
  const signatureKeyId = parseUpdaterSignature(
    readFileSync(signaturePath, 'utf8'),
    signaturePath,
  );
  const publicKeyId = parseUpdaterPublicKey(
    readFileSync(publicKeyPath, 'utf8'),
    publicKeyPath,
  );

  if (signatureKeyId !== publicKeyId) {
    throw new Error(
      `Updater signature key ${signatureKeyId} does not match public key ${publicKeyId}`,
    );
  }

  if (expectedKeyId !== undefined) {
    const normalizedExpectedKeyId = expectedKeyId.toUpperCase();
    if (!KEY_ID_PATTERN.test(normalizedExpectedKeyId)) {
      throw new Error(`Expected updater key ID is invalid: ${expectedKeyId}`);
    }
    if (signatureKeyId !== normalizedExpectedKeyId) {
      throw new Error(
        `Updater signature key ${signatureKeyId} does not match expected key ${normalizedExpectedKeyId}`,
      );
    }
  }

  return signatureKeyId;
};

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const [signaturePath, publicKeyPath, expectedKeyId] = process.argv.slice(2);
  if (!signaturePath || !publicKeyPath || process.argv.length > 5) {
    console.error(
      'Usage: node scripts/verify-updater-signing-key.mjs <signature> <public-key> [expected-key-id]',
    );
    process.exitCode = 2;
  } else {
    try {
      const keyId = verifyUpdaterSigningKey(
        signaturePath,
        publicKeyPath,
        expectedKeyId,
      );
      console.log(`Updater signing key identity verified: ${keyId}.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
