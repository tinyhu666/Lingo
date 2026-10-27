import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readlink, symlink, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initializeGlossary, maintainGlossary, recoverGlossary } from './maintain-glossary.mjs';
import { glossaryRevision } from '../src/glossary-files.mjs';

const catalog = JSON.parse(await readFile(new URL('../src/glossary/official.json', import.meta.url)));
const curated = JSON.parse(await readFile(new URL('../src/glossary/curated.json', import.meta.url)));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'lingo-glossary-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appDir = join(root, 'app'), stateDir = join(root, 'state');
  await mkdir(join(appDir, 'src/glossary'), { recursive: true });
  await writeFile(join(appDir, 'src/glossary/official.json'), JSON.stringify(catalog));
  await writeFile(join(appDir, 'src/glossary/curated.json'), JSON.stringify(curated));
  await initializeGlossary(appDir, stateDir);
  const previous = await readlink(join(stateDir, 'current'));
  const candidate = structuredClone(catalog);
  candidate.revision = 'new-official-revision';
  const calls = [];
  const options = {
    appDir, stateDir, getCatalog: async () => candidate,
    check: async (path) => {
      calls.push('check');
      assert.equal((await readJson(path)).revision, candidate.revision);
      assert.equal(await readlink(join(stateDir, 'current')), previous, 'tests must precede activation');
    },
    restart: async () => { calls.push('restart'); },
    verify: async (revision) => {
      calls.push(`verify:${revision}`);
      const active = await readJson(join(stateDir, 'current/official.json'));
      assert.equal(glossaryRevision(active, curated), revision);
    },
  };
  return { ...options, options, previous, candidate, calls };
}

test('candidate passes checks before activation; snapshots are readable and CSV follows the same version', async (t) => {
  const f = await fixture(t);
  const result = await maintainGlossary(f.options);
  assert.equal(result.status, 'updated');
  assert.deepEqual(f.calls, ['check', 'restart', `verify:${glossaryRevision(f.candidate, curated)}`]);
  assert.notEqual(await readlink(join(f.stateDir, 'current')), f.previous);
  assert.equal((await stat(join(f.stateDir, 'current'))).mode & 0o777, 0o755);
  assert.ok((await readFile(join(f.stateDir, 'current/game-glossary.csv'), 'utf8')).includes('Butterfly'));
  await assert.rejects(readFile(join(f.stateDir, 'pending.json')), { code: 'ENOENT' });
  // Initializing again must preserve server updates across future code releases.
  await initializeGlossary(f.appDir, f.stateDir);
  assert.equal((await readJson(join(f.stateDir, 'current/official.json'))).revision, f.candidate.revision);
});

test('no change still runs checks and verifies the live version without restarting', async (t) => {
  const f = await fixture(t);
  f.candidate.revision = catalog.revision;
  assert.equal((await maintainGlossary(f.options)).status, 'unchanged');
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
  assert.equal(f.calls.includes('restart'), false);
  assert.equal(f.calls[0], 'check');
});

test('source failure, catalog shrink, and dangling aliases never replace active data', async (t) => {
  for (const kind of ['network', 'shrink', 'alias']) {
    const f = await fixture(t);
    if (kind === 'network') f.options.getCatalog = async () => { throw new Error('source unavailable'); };
    if (kind === 'shrink') f.candidate.entries = [];
    if (kind === 'alias') f.candidate.entries = f.candidate.entries.filter((entry) => entry.id !== curated.aliases[0].ref);
    await assert.rejects(maintainGlossary(f.options));
    assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
    assert.deepEqual(f.calls, []);
    assert.equal((await readJson(join(f.stateDir, 'last-run.json'))).status, 'failed');
  }
});

test('failed regression checks and edits during checks leave active data intact', async (t) => {
  for (const kind of ['test-failure', 'concurrent-curated-edit']) {
    const f = await fixture(t);
    f.options.check = async () => {
      if (kind === 'test-failure') throw new Error('regression failed');
      await writeFile(join(f.appDir, 'src/glossary/curated.json'), JSON.stringify({ ...curated, updatedAt: 'later' }));
    };
    await assert.rejects(maintainGlossary(f.options));
    assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
    assert.deepEqual(f.calls, []);
  }
});

test('failed activation restores the previous version and verifies its restarted process', async (t) => {
  const f = await fixture(t);
  const previousRevision = glossaryRevision(catalog, curated);
  f.options.verify = async (revision) => {
    f.calls.push(`verify:${revision}`);
    if (revision !== previousRevision) throw new Error('new process unhealthy');
    assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
  };
  await assert.rejects(maintainGlossary(f.options), /unhealthy/);
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
  assert.deepEqual(f.calls, ['check', 'restart', `verify:${glossaryRevision(f.candidate, curated)}`, 'restart', `verify:${previousRevision}`]);
  await assert.rejects(readFile(join(f.stateDir, 'pending.json')), { code: 'ENOENT' });
});

test('interrupted activation is recoverable without fetching sources or running tests', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.stateDir, 'pending.json'), JSON.stringify({ previous: f.previous, previousRevision: glossaryRevision(catalog, curated) }));
  await symlink('versions/interrupted', join(f.stateDir, 'current.next'));
  await rename(join(f.stateDir, 'current.next'), join(f.stateDir, 'current'));
  assert.equal(await recoverGlossary(f.options), true);
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
  assert.equal(await recoverGlossary(f.options), false);
  assert.deepEqual(f.calls, ['restart', `verify:${glossaryRevision(catalog, curated)}`]);
});

test('failed rollback retains recovery journal for ExecStopPost or next boot', async (t) => {
  const f = await fixture(t);
  f.options.restart = async () => { throw new Error('systemctl unavailable'); };
  await assert.rejects(maintainGlossary(f.options), /rollback requires attention/);
  const pending = await readJson(join(f.stateDir, 'pending.json'));
  assert.equal(pending.previous, f.previous);
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
  assert.equal((await readJson(join(f.stateDir, pending.candidate, 'official.json'))).revision, f.candidate.revision);
});

test('a damaged persistent snapshot is never silently replaced with bundled old data', async (t) => {
  const f = await fixture(t);
  await rm(join(f.stateDir, 'current/official.json'));
  await assert.rejects(initializeGlossary(f.appDir, f.stateDir), { code: 'ENOENT' });
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
});

test('installation rejects incompatible new aliases without replacing a newer persistent catalog', async (t) => {
  const f = await fixture(t);
  const incoming = structuredClone(curated);
  incoming.aliases.push({ ref: 'dota2:hero:new-official-id', forms: ['新英雄'] });
  await writeFile(join(f.appDir, 'src/glossary/curated.json'), JSON.stringify(incoming));
  await assert.rejects(initializeGlossary(f.appDir, f.stateDir), /alias review/);
  assert.equal(await readlink(join(f.stateDir, 'current')), f.previous);
});

test('runtime loads the explicit server catalog and fails closed if it is missing', async (t) => {
  const f = await fixture(t);
  await maintainGlossary(f.options);
  const moduleUrl = new URL('../src/glossary.mjs', import.meta.url).href;
  const program = `import { glossaryStats } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(glossaryStats));`;
  const options = { env: { ...process.env, GLOSSARY_OFFICIAL_PATH: join(f.stateDir, 'current/official.json') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program], options));
  assert.equal(loaded.officialRevision, f.candidate.revision);
  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', program], { ...options, env: { ...options.env, GLOSSARY_OFFICIAL_PATH: join(f.stateDir, 'missing.json') } }));
});
