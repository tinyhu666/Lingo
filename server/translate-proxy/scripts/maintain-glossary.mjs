import { readFile, writeFile, mkdir, mkdtemp, readlink, symlink, rename, rm, readdir, chmod, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { fetchCatalog, validateCatalog, validateAliases } from './update-glossary.mjs';
import { renderGlossaryCsv } from './export-glossary.mjs';
import { glossaryRevision } from '../src/glossary-files.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) => {
  try { await readFile(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
async function writeJson(path, data) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
async function selectVersion(stateDir, version) {
  // Only our relative snapshot directories can become the active catalog.
  if (!/^versions\/[\w.-]+$/.test(version)) throw new Error('Invalid glossary snapshot path');
  const next = join(stateDir, 'current.next');
  await rm(next, { force: true });
  await symlink(version, next);
  await rename(next, join(stateDir, 'current'));
}
async function snapshot(stateDir, official, curated) {
  const directory = await mkdtemp(join(stateDir, 'versions', `${Date.now()}-`));
  await writeJson(join(directory, 'official.json'), official);
  await writeJson(join(directory, 'curated.json'), curated);
  await writeFile(join(directory, 'game-glossary.csv'), renderGlossaryCsv(official, curated));
  await chmod(directory, 0o755); // The serving process runs as lingo-translate.
  return `versions/${directory.split('/').at(-1)}`;
}

export async function initializeGlossary(appDir, stateDir) {
  await mkdir(join(stateDir, 'versions'), { recursive: true, mode: 0o755 });
  let current;
  try { current = await lstat(join(stateDir, 'current')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current) {
    // A broken existing snapshot is corruption, not a first installation.
    if (!current.isSymbolicLink()) throw new Error('Managed glossary current must be a snapshot symlink');
    const official = await readJson(join(stateDir, 'current/official.json'));
    const curated = await readJson(join(appDir, 'src/glossary/curated.json'));
    validateCatalog(official, official);
    validateAliases(official, curated);
    return;
  }
  const official = await readJson(join(appDir, 'src/glossary/official.json'));
  const curated = await readJson(join(appDir, 'src/glossary/curated.json'));
  validateCatalog(official, official);
  validateAliases(official, curated);
  await selectVersion(stateDir, await snapshot(stateDir, official, curated));
}

export async function recoverGlossary({ stateDir, restart, verify }) {
  const path = join(stateDir, 'pending.json');
  if (!(await exists(path))) return false;
  const pending = await readJson(path);
  await selectVersion(stateDir, pending.previous);
  await restart();
  await verify(pending.previousRevision);
  await rm(path);
  await writeJson(join(stateDir, 'last-run.json'), {
    status: 'rolled-back', finishedAt: new Date().toISOString(), revision: pending.previousRevision,
  });
  return true;
}

export async function maintainGlossary({ appDir, stateDir, getCatalog = fetchCatalog, check, restart, verify }) {
  const startedAt = new Date().toISOString();
  let candidate;
  try {
    await recoverGlossary({ stateDir, restart, verify });
    const previous = await readlink(join(stateDir, 'current'));
    const previousOfficial = await readJson(join(stateDir, previous, 'official.json'));
    const curatedText = await readFile(join(appDir, 'src/glossary/curated.json'), 'utf8');
    const curated = JSON.parse(curatedText);
    const official = await getCatalog();
    validateCatalog(official, previousOfficial);
    validateAliases(official, curated);
    const revision = glossaryRevision(official, curated);
    candidate = await snapshot(stateDir, official, curated);
    await check(join(stateDir, candidate, 'official.json'));
    if (curatedText !== await readFile(join(appDir, 'src/glossary/curated.json'), 'utf8')) {
      throw new Error('Curated glossary changed while tests were running');
    }
    const previousCurated = await readJson(join(stateDir, previous, 'curated.json'));
    const unchanged = revision === glossaryRevision(previousOfficial, previousCurated);
    if (unchanged) {
      // Still verify that the serving process uses the persistent catalog.
      await verify(revision);
      await rm(join(stateDir, candidate), { recursive: true });
      candidate = undefined;
    } else {
      await writeJson(join(stateDir, 'pending.json'), {
        previous, previousRevision: glossaryRevision(previousOfficial, curated), candidate,
      });
      await selectVersion(stateDir, candidate);
      await restart();
      await verify(revision);
      await rm(join(stateDir, 'pending.json'));
      candidate = undefined; // It is now active and must never be removed on failure.
    }
    const result = { status: unchanged ? 'unchanged' : 'updated', startedAt, finishedAt: new Date().toISOString(), revision, officialRevision: official.revision, officialTerms: official.entries.length };
    await writeJson(join(stateDir, 'last-run.json'), result);
    // Retain eight snapshots plus the active and previous versions for rollback.
    const protectedVersions = new Set([previous, await readlink(join(stateDir, 'current'))]);
    const versions = (await readdir(join(stateDir, 'versions'))).sort().reverse();
    for (const name of versions.slice(8)) {
      if (!protectedVersions.has(`versions/${name}`)) await rm(join(stateDir, 'versions', name), { recursive: true });
    }
    return result;
  } catch (error) {
    try { await recoverGlossary({ stateDir, restart, verify }); }
    catch (rollbackError) { error = new Error(`${error.message}; rollback requires attention: ${rollbackError.message}`); }
    if (candidate && !(await exists(join(stateDir, 'pending.json')))) await rm(join(stateDir, candidate), { recursive: true, force: true });
    await writeJson(join(stateDir, 'last-run.json'), { status: 'failed', startedAt, finishedAt: new Date().toISOString(), error: error.message });
    throw error;
  }
}

function command(program, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, { stdio: 'inherit', timeout: 180_000, ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${program} failed (${signal || code})`)));
  });
}

async function main() {
  const [mode, appArgument, stateArgument] = process.argv.slice(2);
  if (!['--initialize', '--update', '--recover'].includes(mode) || !appArgument || !stateArgument || process.argv.length !== 5) {
    throw new Error('Usage: maintain-glossary.mjs --initialize|--update|--recover APP_DIR STATE_DIR');
  }
  const appDir = resolve(appArgument), stateDir = resolve(stateArgument);
  const service = process.env.GLOSSARY_PROXY_SERVICE || 'lingo-translate-proxy.service';
  const healthBase = process.env.GLOSSARY_HEALTH_URL || 'http://127.0.0.1:8787';
  const restart = () => command('systemctl', ['restart', service], { timeout: 45_000 });
  const verify = async (revision) => {
    let error;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const health = await fetch(`${healthBase}/healthz`, { signal: AbortSignal.timeout(2000) });
        const response = await fetch(`${healthBase}/translate`, { signal: AbortSignal.timeout(2000) });
        const summary = await response.json();
        if (health.ok && response.ok && summary.glossary?.revision === revision) return;
        throw new Error('Serving glossary revision does not match tested snapshot');
      } catch (failure) { error = failure; }
      await new Promise((done) => setTimeout(done, 500));
    }
    throw error;
  };
  if (mode === '--initialize') return initializeGlossary(appDir, stateDir);
  if (mode === '--recover') return recoverGlossary({ stateDir, restart, verify });
  const check = async (officialPath) => {
    const env = { ...process.env, HOST: '127.0.0.1', GLOSSARY_OFFICIAL_PATH: officialPath };
    const tests = (await readdir(join(appDir, 'src'))).filter((name) => name.endsWith('.test.mjs')).map((name) => `src/${name}`);
    await command(process.execPath, ['--test', ...tests, 'scripts/maintain-glossary.test.mjs'], { cwd: appDir, env });
    for (const script of ['smoke-test.mjs', 'analytics-smoke-test.mjs']) {
      await command(process.execPath, [`scripts/${script}`], { cwd: appDir, env });
    }
  };
  console.log(JSON.stringify(await maintainGlossary({ appDir, stateDir, check, restart, verify })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
