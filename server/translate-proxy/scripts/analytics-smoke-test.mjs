import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async (baseUrl) => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await wait(200);
  }

  throw new Error('Server did not become ready in time');
};

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: response.ok,
    json: payload,
  };
};

const postEvents = async (baseUrl, events) => {
  return fetchJson(`${baseUrl}/analytics/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-public-key',
    },
    body: JSON.stringify({ events }),
  });
};

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lingo-analytics-'));
const runtimeConfigPath = path.join(tempDir, 'runtime-config.json');
const analyticsDbPath = path.join(tempDir, 'analytics.sqlite');
const port = 9897;
const baseUrl = `http://127.0.0.1:${port}`;
const proxyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: proxyRoot,
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_TOKEN: 'test-admin-token',
    BACKEND_PUBLIC_KEY: 'test-public-key',
    MODEL_API_KEY: 'test-model-key',
    RUNTIME_CONFIG_PATH: runtimeConfigPath,
    ANALYTICS_DB_PATH: analyticsDbPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(baseUrl);

  const duplicateOccurredAt = '2026-03-28T12:00:00.000Z';
  const firstBatch = await postEvents(baseUrl, [
    {
      installation_id: 'install-1',
      event_name: 'install_registered',
      occurred_at: duplicateOccurredAt,
      session_id: 'session-1',
      analytics_day: '2026-03-28',
      platform: 'windows',
      app_version: '0.6.2',
      ui_locale: 'zh-CN',
      runtime: 'tauri-desktop',
    },
    {
      installation_id: 'install-1',
      event_name: 'app_launch',
      occurred_at: duplicateOccurredAt,
      session_id: 'session-1',
      analytics_day: '2026-03-28',
      platform: 'windows',
      app_version: '0.6.2',
      ui_locale: 'zh-CN',
      runtime: 'tauri-desktop',
    },
    {
      installation_id: 'install-1',
      event_name: 'app_active_ping',
      occurred_at: duplicateOccurredAt,
      session_id: 'session-1',
      analytics_day: '2026-03-28',
      platform: 'windows',
      app_version: '0.6.2',
      ui_locale: 'zh-CN',
      runtime: 'tauri-desktop',
    },
  ]);

  expect(firstBatch.ok, `first analytics batch should succeed: ${firstBatch.json.message || firstBatch.status}`);
  expect(firstBatch.json.accepted === 3, 'first analytics batch should accept three events');
  expect(firstBatch.json.inserted === 3, 'first analytics batch should insert three events');
  expect(firstBatch.json.duplicates === 0, 'first analytics batch should not report duplicates');

  const secondBatch = await postEvents(baseUrl, [
    {
      installation_id: 'install-1',
      event_name: 'app_launch',
      occurred_at: duplicateOccurredAt,
      session_id: 'session-1',
      analytics_day: '2026-03-28',
      platform: 'windows',
      app_version: '0.6.2',
      ui_locale: 'zh-CN',
      runtime: 'tauri-desktop',
    },
    {
      installation_id: 'install-2',
      event_name: 'app_active_ping',
      occurred_at: '2026-03-28T13:00:00.000Z',
      session_id: 'session-2',
      analytics_day: '2026-03-28',
      platform: 'macos',
      app_version: '0.6.2',
      ui_locale: 'en-US',
      runtime: 'tauri-desktop',
    },
  ]);

  expect(secondBatch.ok, `second analytics batch should succeed: ${secondBatch.json.message || secondBatch.status}`);
  expect(secondBatch.json.accepted === 2, 'second analytics batch should accept two events');
  expect(secondBatch.json.inserted === 1, 'second analytics batch should insert only one new event');
  expect(secondBatch.json.duplicates === 1, 'second analytics batch should report one duplicate');

  const daily = await fetchJson(`${baseUrl}/analytics/public/daily?from=2026-03-28&to=2026-03-28`);
  expect(daily.ok, 'daily analytics endpoint should succeed');
  expect(daily.json.timezone === 'Asia/Shanghai', 'daily analytics should report Asia/Shanghai timezone');
  expect(Array.isArray(daily.json.days) && daily.json.days.length === 1, 'daily analytics should return one row');
  expect(daily.json.days[0].dau === 2, 'daily analytics should count two active installations');
  expect(daily.json.days[0].launches === 1, 'daily analytics should count one launch');
  expect(daily.json.days[0].installs === 1, 'daily analytics should count one install');

  const overview = await fetchJson(`${baseUrl}/analytics/public/overview`);
  expect(overview.ok, 'overview analytics endpoint should succeed');
  expect(overview.json.metrics.installations_total === 2, 'overview should count two installations total');
  expect(overview.json.metrics.active_installations_30d === 2, 'overview should count two active installations');

  const dashboardResponse = await fetch(`${baseUrl}/analytics/dashboard`);
  const dashboardHtml = await dashboardResponse.text();
  expect(dashboardResponse.ok, 'dashboard page should succeed');
  expect(dashboardHtml.includes('Lingo Analytics'), 'dashboard page should contain the analytics title');
  expect(dashboardHtml.includes('/analytics/public/overview'), 'dashboard page should call overview endpoint');

  console.log('[smoke] analytics smoke test passed');
} finally {
  child.kill('SIGTERM');
  await wait(300);
  await rm(tempDir, { recursive: true, force: true });
}
