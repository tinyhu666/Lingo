import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const RELEASE_REPO = process.env.RELEASE_REPO || 'tinyhu666/Lingo';
const RELEASE_TAG = String(process.env.RELEASE_TAG || '').trim();
const COS_PUBLIC_BASE_URL = String(process.env.TENCENT_COS_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const OUTPUT_DIR = path.resolve(process.cwd(), process.env.COS_PREP_DIR || '.mirror-cos');

if (!RELEASE_TAG) {
  throw new Error('RELEASE_TAG is required.');
}

if (!COS_PUBLIC_BASE_URL) {
  throw new Error('TENCENT_COS_PUBLIC_BASE_URL is required.');
}

const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Lingo-Release-Mirror',
};

if (process.env.GITHUB_TOKEN) {
  githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const normalizeVersion = (value) => String(value || '').replace(/^v/i, '').trim();

const releaseVersion = normalizeVersion(RELEASE_TAG);

if (!releaseVersion) {
  throw new Error(`Invalid RELEASE_TAG: ${RELEASE_TAG}`);
}

const releaseApiUrl = `https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`;
const releasePageUrl =
  String(process.env.WEBSITE_RELEASE_PAGE_URL || 'https://buffpp.com/#download').trim() ||
  `https://github.com/${RELEASE_REPO}/releases/latest`;
const stableDownloads = {
  macos: `${COS_PUBLIC_BASE_URL}/releases/Lingo_latest_aarch64.dmg`,
  windows: `${COS_PUBLIC_BASE_URL}/releases/Lingo_latest_x64-setup.exe`,
  windows_portable: `${COS_PUBLIC_BASE_URL}/releases/Lingo_latest_x64-portable.zip`,
};

async function fetchJson(url, headers = githubHeaders) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      ...githubHeaders,
      Accept: 'application/octet-stream',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}

function getReleaseAsset(release, assetName) {
  const asset = release.assets.find((item) => item.name === assetName);

  if (!asset) {
    throw new Error(`Release asset not found: ${assetName}`);
  }

  return asset;
}

function findReleaseAsset(release, assetName) {
  return release.assets.find((item) => item.name === assetName) ?? null;
}

function maybeAddAssetName(release, assetNames, assetName) {
  if (findReleaseAsset(release, assetName)) {
    assetNames.add(assetName);
  }
}

function maybeAddSignatureAssetName(release, assetNames, assetName) {
  maybeAddAssetName(release, assetNames, `${assetName}.sig`);
}

function buildMirrorUrl(assetName) {
  return `${COS_PUBLIC_BASE_URL}/releases/v${releaseVersion}/${assetName}`;
}

function stripBom(value) {
  return typeof value === 'string' ? value.replace(/^\uFEFF/, '') : value;
}

async function main() {
  const release = await fetchJson(releaseApiUrl);
  const latestAsset = getReleaseAsset(release, 'latest.json');

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });

  const outputRoot = path.join(OUTPUT_DIR, 'releases');
  const versionRoot = path.join(outputRoot, `v${releaseVersion}`);

  await fs.mkdir(versionRoot, { recursive: true });

  const latestJsonPath = path.join(versionRoot, 'latest.json');
  await downloadFile(latestAsset.browser_download_url, latestJsonPath);

  const latestPayload = JSON.parse(stripBom(await fs.readFile(latestJsonPath, 'utf8')));
  const platformEntries = Object.values(latestPayload.platforms || {});
  const portableAssetName = `Lingo_${releaseVersion}_x64-portable.zip`;
  const assetNames = new Set();

  maybeAddAssetName(release, assetNames, `Lingo_${releaseVersion}_aarch64.dmg`);
  maybeAddAssetName(release, assetNames, `Lingo_${releaseVersion}_x64-setup.exe`);
  maybeAddSignatureAssetName(release, assetNames, `Lingo_${releaseVersion}_x64-setup.exe`);

  if (findReleaseAsset(release, portableAssetName)) {
    assetNames.add(portableAssetName);
  }

  for (const platform of platformEntries) {
    if (platform && typeof platform.url === 'string' && platform.url) {
      const assetName = path.posix.basename(new URL(platform.url).pathname);
      assetNames.add(assetName);
      maybeAddSignatureAssetName(release, assetNames, assetName);
    }
  }

  for (const assetName of assetNames) {
    const asset = getReleaseAsset(release, assetName);
    await downloadFile(asset.browser_download_url, path.join(versionRoot, assetName));
  }

  const mirroredLatestPayload = structuredClone(latestPayload);

  for (const platform of Object.values(mirroredLatestPayload.platforms || {})) {
    if (platform && typeof platform.url === 'string' && platform.url) {
      const assetName = path.posix.basename(new URL(platform.url).pathname);
      platform.url = buildMirrorUrl(assetName);
    }
  }

  const stableLatestJsonPath = path.join(outputRoot, 'latest.json');
  const stableWebsiteJsonPath = path.join(outputRoot, 'latest-web.json');
  const prettyMirroredLatestPayload = `${JSON.stringify(mirroredLatestPayload, null, 2)}\n`;

  await fs.writeFile(latestJsonPath, prettyMirroredLatestPayload);
  await fs.writeFile(stableLatestJsonPath, prettyMirroredLatestPayload);

  const websiteManifest = {
    version: releaseVersion,
    published_at: release.published_at || release.created_at || latestPayload.pub_date || null,
    notes: typeof release.body === 'string' && release.body.trim() ? release.body : latestPayload.notes || null,
    release_page: releasePageUrl,
    downloads: stableDownloads,
  };

  await fs.writeFile(stableWebsiteJsonPath, `${JSON.stringify(websiteManifest, null, 2)}\n`);

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${releaseVersion}\noutput_dir=${OUTPUT_DIR.replace(/\\/g, '/')}\n`,
    );
  }

  console.log(`Prepared mirrored release payload for v${releaseVersion} in ${OUTPUT_DIR}`);
}

await main();
