import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseUpdaterPublicKey, parseUpdaterSignature } from './verify-updater-signing-key.mjs';

// Minisign's ED format signs Blake2b-512(data), then signature + trusted comment.
// https://jedisct1.github.io/minisign/#signature-format
export function verifyAssetSignature(data, signature, publicKey) {
  assert.equal(parseUpdaterSignature(signature), parseUpdaterPublicKey(publicKey));
  const lines = Buffer.from(signature.trim(), 'base64').toString().trimEnd().split(/\r?\n/);
  const keyLines = Buffer.from(publicKey.trim(), 'base64').toString().trimEnd().split(/\r?\n/);
  const rawKey = Buffer.from(keyLines[1], 'base64').subarray(10);
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawKey]),
    format: 'der', type: 'spki',
  });
  const rawSignature = Buffer.from(lines[1], 'base64').subarray(10);
  assert(verify(null, createHash('blake2b512').update(data).digest(), key, rawSignature), 'Invalid artifact signature');
  const comment = lines[2].slice('trusted comment: '.length);
  assert(verify(null, Buffer.concat([rawSignature, Buffer.from(comment)]), key, Buffer.from(lines[3], 'base64')), 'Invalid trusted comment signature');
}

export function verifyReleaseAssets(directory, tag) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/);
  const version = tag.slice(1);
  const read = (name) => readFileSync(resolve(directory, name));
  const release = JSON.parse(read('release.json'));
  const manifest = JSON.parse(read('latest.json').toString().replace(/^\uFEFF/, ''));
  assert.equal(release.tag_name, tag);
  assert.equal(release.prerelease, false);
  assert.equal(manifest.version, version);
  const required = [
    `Lingo_${version}_aarch64.dmg`, `Lingo_${version}_x64-setup.exe`,
    `Lingo_${version}_x64_zh-CN.msi`, `Lingo_${version}_x64-portable.zip`,
    'Lingo_aarch64.app.tar.gz', 'latest.json',
  ];
  for (const name of required) assert(release.assets.some((a) => a.name === name), `Missing ${name}`);
  const publicKey = readFileSync('.github/updater/updater.key.pub', 'utf8');
  for (const asset of release.assets) {
    assert.equal(asset.name, basename(asset.name));
    const data = read(asset.name);
    assert(data.length > 0, `Empty ${asset.name}`);
    assert.equal(data.length, asset.size, `Size mismatch: ${asset.name}`);
    assert.equal(`sha256:${createHash('sha256').update(data).digest('hex')}`, asset.digest, `Digest mismatch: ${asset.name}`);
    if (asset.name.endsWith('.sig')) {
      verifyAssetSignature(read(asset.name.slice(0, -4)), data.toString(), publicKey);
    }
  }
  for (const name of [required[1], required[2], required[4]]) {
    assert(release.assets.some((a) => a.name === `${name}.sig`), `Missing signature: ${name}`);
  }
  for (const platform of ['darwin-aarch64', 'windows-x86_64']) {
    const entry = manifest.platforms?.[platform];
    assert(entry, `Missing updater platform: ${platform}`);
    const url = new URL(entry.url);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, `/tinyhu666/Lingo/releases/download/${tag}/${basename(url.pathname)}`);
    const expected = platform === 'darwin-aarch64' ? [required[4]] : [required[1], required[2]];
    const name = decodeURIComponent(basename(url.pathname));
    assert(expected.includes(name), `Wrong updater artifact: ${platform}`);
    assert.equal(entry.signature.trim(), read(`${name}.sig`).toString().trim());
    verifyAssetSignature(read(name), entry.signature, publicKey);
  }
  console.log(`Verified ${tag}: both platforms, asset SHA-256 digests, updater signatures and manifest.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyReleaseAssets(process.argv[2], process.argv[3]);
}
