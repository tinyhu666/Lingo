import { readFileSync } from 'node:fs';

import { parseUpdaterPublicKey } from './verify-updater-signing-key.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const publicKey = readFileSync('.github/updater/updater.key.pub', 'utf8').trim();
const legacyPublicKey = readFileSync(
  '.github/updater/updater-legacy.key.pub',
  'utf8',
).trim();

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\r?\nname = "Lingo"\r?\nversion = "([^"]+)"/,
)?.[1];
const versions = {
  'package-lock.json': packageLock.version,
  'package-lock.json root package': packageLock.packages?.['']?.version,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock': cargoLockVersion,
  'src-tauri/tauri.conf.json': tauriConfig.version,
  'WiX bundle': tauriConfig.bundle?.windows?.wix?.version,
};

const expectedVersion = packageJson.version;
const expectedWixVersion = `${expectedVersion}.0`;

for (const [source, version] of Object.entries(versions)) {
  const expected = source === 'WiX bundle' ? expectedWixVersion : expectedVersion;
  if (version !== expected) {
    throw new Error(`${source} has version ${version ?? '<missing>'}; expected ${expected}`);
  }
}

const configuredPublicKey = tauriConfig.plugins?.updater?.pubkey?.trim();
if (configuredPublicKey !== publicKey) {
  throw new Error('Tauri updater public key does not match .github/updater/updater.key.pub');
}

const publicKeyId = parseUpdaterPublicKey(
  publicKey,
  '.github/updater/updater.key.pub',
);
const legacyPublicKeyId = parseUpdaterPublicKey(
  legacyPublicKey,
  '.github/updater/updater-legacy.key.pub',
);
if (publicKeyId === legacyPublicKeyId) {
  throw new Error('Current and legacy updater public keys must be different');
}

console.log(`Release configuration verified for v${expectedVersion}.`);
