import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
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

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const jsonResponse = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lingo-proxy-'));
const runtimeConfigPath = path.join(tempDir, 'runtime-config.json');
const port = 9797;
const upstreamPort = 9798;
const baseUrl = `http://127.0.0.1:${port}`;
const upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}`;
const proxyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const primaryPath = '/primary/v1/chat/completions';
const fastPath = '/fast/v1/chat/completions';

const upstreamState = {
  primaryHits: 0,
  fastHits: 0,
  fastTransientFailures: 0,
};

const upstream = createServer(async (req, res) => {
  const payload = await readJsonBody(req);
  const userText = String(payload?.messages?.[1]?.content || '').trim();
  const auth = String(req.headers.authorization || '');

  if (req.url === primaryPath) {
    upstreamState.primaryHits += 1;
    expect(auth === 'Bearer primary-model-key', 'primary model auth should use primary key');
    return jsonResponse(res, 200, {
      choices: [{ message: { content: `PRIMARY:${userText}` } }],
    });
  }

  if (req.url === fastPath) {
    upstreamState.fastHits += 1;
    expect(auth === 'Bearer fast-model-key', 'fast model auth should use fast key');

    if (userText === 'fallback once' && upstreamState.fastTransientFailures === 0) {
      upstreamState.fastTransientFailures += 1;
      return jsonResponse(res, 503, { message: 'fast lane temporary outage' });
    }

    const fastText = userText === 'fallback once' ? 'FAST-RECOVERED:fallback once' : `FAST:${userText}`;
    return jsonResponse(res, 200, {
      choices: [{ message: { content: fastText } }],
    });
  }

  return jsonResponse(res, 404, { message: 'unknown upstream path' });
});

await new Promise((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: proxyRoot,
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_TOKEN: 'test-admin-token',
    BACKEND_PUBLIC_KEY: 'test-public-key',
    PRIMARY_MODEL_API_KEY: 'primary-model-key',
    FAST_MODEL_API_KEY: 'fast-model-key',
    RUNTIME_CONFIG_PATH: runtimeConfigPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const updateRuntimeConfig = async (payload) => {
  const response = await fetch(`${baseUrl}/admin/runtime-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-admin-token',
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  expect(response.ok, `PUT /admin/runtime-config should succeed: ${json.message || response.status}`);
  return json;
};

const translate = async (text) => {
  const response = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-public-key',
    },
    body: JSON.stringify({
      text,
      translation_from: 'en',
      translation_to: 'zh',
    }),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
};

try {
  await waitForServer(baseUrl);

  const health = await fetch(`${baseUrl}/healthz`);
  expect(health.ok, 'GET /healthz should succeed');

  const summaryResponse = await fetch(`${baseUrl}/translate`);
  const summary = await summaryResponse.json();
  expect(summaryResponse.ok, 'GET /translate should succeed');
  expect(summary.provider === 'openai-compatible', 'default provider should be openai-compatible');

  const fastOnlyConfig = await updateRuntimeConfig({
    enabled: true,
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-ai/DeepSeek-R1',
    api_key_env_name: 'MISSING_PRIMARY_MODEL_KEY',
    temperature: 0.2,
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate'],
    },
  });
  expect(fastOnlyConfig.fast_lane?.enabled === true, 'fast lane config should round-trip');
  expect(
    fastOnlyConfig.fast_lane?.model === 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    'fast lane model should be returned',
  );

  const fastOnlyResult = await translate('hello');
  expect(fastOnlyResult.status === 200, 'fast-lane request should succeed without primary key');
  expect(fastOnlyResult.json.model_route === 'fast-lane', 'short request should use fast lane');
  expect(fastOnlyResult.json.translated_text === 'FAST:hello', 'fast lane response should be returned');

  const fallbackConfig = await updateRuntimeConfig({
    enabled: true,
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-ai/DeepSeek-R1',
    api_key_env_name: 'PRIMARY_MODEL_API_KEY',
    temperature: 0.2,
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate'],
    },
  });
  expect(fallbackConfig.model === 'deepseek-ai/DeepSeek-R1', 'primary model should round-trip');

  const firstFallback = await translate('fallback once');
  expect(firstFallback.status === 200, 'fallback request should still succeed');
  expect(firstFallback.json.model_route === 'fast-fallback', 'first request should fall back to primary');
  expect(
    firstFallback.json.translated_text === 'PRIMARY:fallback once',
    'fallback should return primary model content',
  );

  const secondFallback = await translate('fallback once');
  expect(secondFallback.status === 200, 'second request should succeed');
  expect(secondFallback.json.model_route === 'fast-lane', 'second request should retry fast lane');
  expect(
    secondFallback.json.translated_text === 'FAST-RECOVERED:fallback once',
    'second request should not reuse cached primary fallback',
  );
  expect(upstreamState.fastHits >= 3, 'fast lane should be retried after transient fallback');

  const disabledConfig = await updateRuntimeConfig({
    enabled: false,
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate'],
    },
  });
  expect(disabledConfig.enabled === false, 'updated config should disable service');

  const blockedResponse = await translate('hello');
  expect(blockedResponse.status === 503, 'disabled config should block translate requests');
  expect(blockedResponse.json.message === 'Translation service is disabled', 'disabled message should match');

  console.log('[smoke] translate proxy smoke test passed');
} finally {
  child.kill('SIGTERM');
  await wait(300);
  await new Promise((resolve) => upstream.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
