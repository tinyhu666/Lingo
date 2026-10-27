import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';

test('diagnostics expire without restart and expired offline uploads stay discarded', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const dir = mkdtempSync(join(tmpdir(), 'lingo-retention-'));
  const oldPath = process.env.ANALYTICS_DB_PATH;
  process.env.ANALYTICS_DB_PATH = join(dir, 'analytics.sqlite');
  const originalNow = Date.now;
  const now = originalNow();
  const day = 86400000;
  let inspection;
  try {
    const store = await import('./analytics-store.mjs');
    const event = (id, timestamp) => ({
      event_name: 'translation_diagnostic', installation_id: 'test-install',
      operation_id: id, occurred_at: new Date(timestamp).toISOString(),
      stage: 'request', status: 'failed',
    });
    assert.equal(store.ingestAnalyticsEvents([
      event('expired-upload', now - 31 * day),
      event('recent-upload', now - 29 * day),
    ]).inserted, 1);
    assert.equal(store.recordTranslationServerDiagnostic(event('expired-server', now - 31 * day)), false);
    assert.equal(store.recordTranslationServerDiagnostic(event('recent-server', now)), true);

    // Advance a running process beyond retention; do not reload the module.
    Date.now = () => now + 2 * day;
    t.mock.timers.tick(60 * 60 * 1000);
    inspection = new Database(process.env.ANALYTICS_DB_PATH, { readonly: true });
    assert.equal(inspection.prepare('SELECT COUNT(*) n FROM translation_diagnostics').get().n, 1);
    assert.deepEqual(store.queryTranslationDiagnostics().diagnostics.map(x => x.operation_id), ['recent-server']);
    Date.now = () => now + 31 * day;
    assert.equal(store.queryTranslationDiagnostics().count, 0);
    assert.equal(inspection.prepare('SELECT COUNT(*) n FROM translation_diagnostics').get().n, 0);
    assert.equal(store.ingestAnalyticsEvents([event('recent-upload', now - 29 * day)]).inserted, 0);

    // Lifecycle events have separate retention and must remain unaffected.
    assert.equal(store.ingestAnalyticsEvents([{
      installation_id: 'test-install', event_name: 'app_launch',
      occurred_at: new Date(now - 60 * day).toISOString(),
    }]).inserted, 1);
  } finally {
    Date.now = originalNow;
    inspection?.close();
    if (oldPath === undefined) delete process.env.ANALYTICS_DB_PATH;
    else process.env.ANALYTICS_DB_PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
