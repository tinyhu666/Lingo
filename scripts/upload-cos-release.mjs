import fs from 'node:fs/promises';
import path from 'node:path';

const { default: COSModule } = await import('cos-nodejs-sdk-v5');
const COS = COSModule?.default ?? COSModule;

const SecretId = String(process.env.TENCENT_SECRET_ID || '').trim();
const SecretKey = String(process.env.TENCENT_SECRET_KEY || '').trim();
const SecurityToken = String(process.env.TENCENT_COS_SESSION_TOKEN || '').trim();
const Bucket = String(process.env.TENCENT_COS_BUCKET || '').trim();
const Region = String(process.env.TENCENT_COS_REGION || '').trim();
const ReleaseTag = String(process.env.RELEASE_TAG || '').trim();
const PrepDir = path.resolve(process.cwd(), process.env.COS_PREP_DIR || '.mirror-cos');

if (!SecretId || !SecretKey) {
  throw new Error('Tencent COS credentials are missing.');
}

if (!Bucket || !Region) {
  throw new Error('TENCENT_COS_BUCKET and TENCENT_COS_REGION are required.');
}

if (!ReleaseTag) {
  throw new Error('RELEASE_TAG is required.');
}

const version = ReleaseTag.replace(/^v/i, '').trim();

if (!version) {
  throw new Error(`Invalid RELEASE_TAG: ${ReleaseTag}`);
}

const versionRoot = path.join(PrepDir, 'releases', `v${version}`);
const manifestRoot = path.join(PrepDir, 'releases');

const cos = new COS({
  SecretId,
  SecretKey,
  SecurityToken: SecurityToken || undefined,
});

function normalizeKey(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

async function collectFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function putObject(params) {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });
}

async function uploadFile(localPath, remoteKey, cacheControl) {
  const key = normalizeKey(remoteKey);
  const body = await fs.readFile(localPath);

  const data = await putObject({
    Bucket,
    Region,
    Key: key,
    Body: body,
    ACL: 'public-read',
    CacheControl: cacheControl,
    ContentLength: body.length,
  });

  console.log(`Uploaded ${localPath} => cos://${Bucket}/${key}`);
  return data;
}

async function uploadVersionedReleaseFiles() {
  const files = await collectFiles(versionRoot);
  files.sort();

  for (const localPath of files) {
    const relativePath = path.relative(versionRoot, localPath);
    const remoteKey = path.posix.join('releases', `v${version}`, normalizeKey(relativePath));
    await uploadFile(localPath, remoteKey, 'public,max-age=31536000,immutable');
  }
}

async function uploadStableAliases() {
  await uploadFile(
    path.join(versionRoot, `Lingo_${version}_aarch64.dmg`),
    'releases/Lingo_latest_aarch64.dmg',
    'public,max-age=60',
  );

  await uploadFile(
    path.join(versionRoot, `Lingo_${version}_x64-setup.exe`),
    'releases/Lingo_latest_x64-setup.exe',
    'public,max-age=60',
  );

  const portableZipPath = path.join(versionRoot, `Lingo_${version}_x64-portable.zip`);
  try {
    await fs.access(portableZipPath);
    await uploadFile(
      portableZipPath,
      'releases/Lingo_latest_x64-portable.zip',
      'public,max-age=60',
    );
  } catch {
    console.log(`Portable ZIP not found for v${version}; skipping portable alias upload.`);
  }
}

async function uploadLatestManifests() {
  await uploadFile(path.join(manifestRoot, 'latest.json'), 'releases/latest.json', 'public,max-age=60');
  await uploadFile(path.join(manifestRoot, 'latest-web.json'), 'releases/latest-web.json', 'public,max-age=60');
}

try {
  await uploadVersionedReleaseFiles();
  await uploadStableAliases();
  await uploadLatestManifests();

  console.log(`Tencent COS upload completed for v${version}.`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
