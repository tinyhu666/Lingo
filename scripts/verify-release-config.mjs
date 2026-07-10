import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8');
const publicKey = readFileSync('.github/updater/updater.key.pub', 'utf8').trim();

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  'package-lock.json': packageLock.version,
  'package-lock.json root package': packageLock.packages?.['']?.version,
  'src-tauri/Cargo.toml': cargoVersion,
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

const decodedPublicKey = Buffer.from(publicKey, 'base64').toString('utf8');
if (!/^untrusted comment: minisign public key: [0-9A-F]{16}\nRW[A-Za-z0-9+/=]+\n$/.test(decodedPublicKey)) {
  throw new Error('Updater public key is not a valid Tauri minisign public key');
}

console.log(`Release configuration verified for v${expectedVersion}.`);
