import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const rawVersion = process.argv[2] || process.env.RELEASE_VERSION || '';
const releaseVersion = String(rawVersion).replace(/^v/i, '').trim();
const repoSlug = process.argv[3] || process.env.GITHUB_REPOSITORY || 'tinyhu666/Lingo';

if (!releaseVersion) {
  throw new Error('Missing release version. Usage: node scripts/sync-github-release-notes.mjs 0.3.19');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(detail || `Command failed: ${command} ${args.join(' ')}`);
  }

  return result.stdout;
}

function getReleaseNotes(version) {
  return run(process.execPath, [path.join(scriptDir, 'get-release-notes.mjs'), version]).trim();
}

function getGitHubCredential() {
  const output = run('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
  });
  const credential = {};

  for (const line of output.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      credential[match[1]] = match[2];
    }
  }

  if (!credential.username || !credential.password) {
    throw new Error('Missing GitHub credential from git credential store.');
  }

  return credential;
}

async function request(url, options, credential) {
  const token = Buffer.from(`${credential.username}:${credential.password}`, 'utf8').toString('base64');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Lingo-Release-Notes-Sync',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  return response.json();
}

const notes = getReleaseNotes(releaseVersion);
const credential = getGitHubCredential();
const tagName = `v${releaseVersion}`;

const release = await request(`https://api.github.com/repos/${repoSlug}/releases/tags/${tagName}`, {}, credential);
const updated = await request(
  `https://api.github.com/repos/${repoSlug}/releases/${release.id}`,
  {
    method: 'PATCH',
    body: JSON.stringify({ body: notes }),
  },
  credential,
);

console.log(updated.html_url);
