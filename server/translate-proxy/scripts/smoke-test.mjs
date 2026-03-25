import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lingo-proxy-'));
const runtimeConfigPath = path.join(tempDir, 'runtime-config.json');
const port = 9797;
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: path.resolve('server/translate-proxy'),
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_TOKEN: 'test-admin-token',
    BACKEND_PUBLIC_KEY: 'test-public-key',
    MODEL_API_KEY: 'test-model-key',
    RUNTIME_CONFIG_PATH: runtimeConfigPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(baseUrl);

  const health = await fetch(`${baseUrl}/healthz`);
  expect(health.ok, 'GET /healthz should succeed');

  const summaryResponse = await fetch(`${baseUrl}/translate`);
  const summary = await summaryResponse.json();
  expect(summaryResponse.ok, 'GET /translate should succeed');
  expect(summary.provider === 'openai-compatible', 'default provider should be openai-compatible');

  const updateResponse = await fetch(`${baseUrl}/admin/runtime-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-admin-token',
    },
    body: JSON.stringify({
      enabled: false,
      model_name: 'deepseek-ai/DeepSeek-R1',
      temperature: 0.2,
    }),
  });
  const updated = await updateResponse.json();
  expect(updateResponse.ok, 'PUT /admin/runtime-config should succeed');
  expect(updated.enabled === false, 'updated config should disable service');
  expect(updated.model === 'deepseek-ai/DeepSeek-R1', 'updated model should be returned');

  const blockedResponse = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-public-key',
    },
    body: JSON.stringify({
      text: 'hello',
      translation_from: 'en',
      translation_to: 'zh',
    }),
  });
  const blocked = await blockedResponse.json();
  expect(blockedResponse.status === 503, 'disabled config should block translate requests');
  expect(blocked.message === 'Translation service is disabled', 'disabled message should match');

  console.log('[smoke] translate proxy smoke test passed');
} finally {
  child.kill('SIGTERM');
  await wait(300);
  await rm(tempDir, { recursive: true, force: true });
}
