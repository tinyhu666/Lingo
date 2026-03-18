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
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE_BYTES = 1024 * 1024;
const MULTIPART_ASYNC_LIMIT = 1;
const MAX_UPLOAD_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2_000;
const SDK_REQUEST_TIMEOUT_MS = 120_000;
const SDK_PROGRESS_INTERVAL_MS = 5_000;

const cos = new COS({
  SecretId,
  SecretKey,
  SecurityToken: SecurityToken || undefined,
  Timeout: SDK_REQUEST_TIMEOUT_MS,
  ProgressInterval: SDK_PROGRESS_INTERVAL_MS,
  ChunkParallelLimit: MULTIPART_ASYNC_LIMIT,
  FileParallelLimit: 1,
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

function managedUpload(params) {
  return new Promise((resolve, reject) => {
    if (typeof cos.uploadFile !== 'function') {
      reject(new Error('cos.uploadFile is not available in current SDK.'));
      return;
    }

    cos.uploadFile(params, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableUploadError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || error?.error?.Code || '');
  const statusCode = Number(error?.statusCode || error?.error?.statusCode || 0);

  if (statusCode >= 500 || statusCode === 408 || statusCode === 429) {
    return true;
  }

  return [
    'UserNetworkTooSlow',
    'RequestTimeout',
    'TimeoutError',
    'NetworkingError',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
  ].includes(code) || /network|timeout|socket hang up|temporarily unavailable/i.test(message);
}

async function retryUpload(taskLabel, handler) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`Retrying ${taskLabel} (attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS})...`);
      }

      return await handler(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_UPLOAD_ATTEMPTS || !isRetryableUploadError(error)) {
        throw error;
      }

      const waitMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Upload failed for ${taskLabel} with retryable error (${error?.code || error?.error?.Code || error?.message || 'unknown'}). Waiting ${waitMs}ms before retry...`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}

async function uploadFile(localPath, remoteKey, cacheControl) {
  const key = normalizeKey(remoteKey);
  const stats = await fs.stat(localPath);

  console.log(`Starting upload ${localPath} (${stats.size} bytes) => cos://${Bucket}/${key}`);

  const data = await retryUpload(`cos://${Bucket}/${key}`, async () => {
    if (typeof cos.uploadFile === 'function') {
      return managedUpload({
        Bucket,
        Region,
        Key: key,
        FilePath: localPath,
        ACL: 'public-read',
        CacheControl: cacheControl,
        SliceSize: MULTIPART_THRESHOLD_BYTES,
        ChunkSize: MULTIPART_CHUNK_SIZE_BYTES,
        AsyncLimit: MULTIPART_ASYNC_LIMIT,
        onProgress: (progress) => {
          if (!progress) {
            return;
          }

          const loaded = Number(progress.loaded || 0);
          const total = Number(progress.total || stats.size || 0);
          const percent = total > 0 ? ((loaded / total) * 100).toFixed(1) : '0.0';
          const speedKib = progress.speed ? `${Math.round(progress.speed / 1024)} KiB/s` : 'n/a';
          console.log(`Progress ${key}: ${percent}% (${loaded}/${total} bytes, ${speedKib})`);
        },
      });
    }

    const body = await fs.readFile(localPath);

    return putObject({
      Bucket,
      Region,
      Key: key,
      Body: body,
      ACL: 'public-read',
      CacheControl: cacheControl,
      ContentLength: body.length,
    });
  });

  console.log(`Uploaded ${localPath} (${stats.size} bytes) => cos://${Bucket}/${key}`);
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
