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
  lastPrimarySystemPrompt: '',
  lastFastSystemPrompt: '',
};

const upstream = createServer(async (req, res) => {
  const payload = await readJsonBody(req);
  const userText = String(payload?.messages?.[1]?.content || '').trim();
  const systemPrompt = String(payload?.messages?.[0]?.content || payload?.system || '').trim();
  const auth = String(req.headers.authorization || '');

  if (req.url === primaryPath) {
    upstreamState.primaryHits += 1;
    upstreamState.lastPrimarySystemPrompt = systemPrompt;
    expect(auth === 'Bearer primary-model-key', 'primary model auth should use primary key');
    return jsonResponse(res, 200, {
      choices: [{ message: { content: `PRIMARY:${userText}` } }],
    });
  }

  if (req.url === fastPath) {
    upstreamState.fastHits += 1;
    upstreamState.lastFastSystemPrompt = systemPrompt;
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

const fetchPublicSiteConfig = async () => {
  const response = await fetch(`${baseUrl}/public/site-config`);
  const json = await response.json();
  expect(response.ok, `GET /public/site-config should succeed: ${json.message || response.status}`);
  return json;
};

const translate = async (payloadOverrides = {}) => {
  const response = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-public-key',
    },
    body: JSON.stringify({
      text: 'hello',
      translation_from: 'en',
      translation_to: 'zh',
      translation_mode: 'auto',
      game_scene: 'dota2',
      ...payloadOverrides,
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

  const defaultPublicSiteConfig = await fetchPublicSiteConfig();
  expect(
    defaultPublicSiteConfig.contact?.discord_url === 'https://discord.gg/cWB49jCfdP',
    'default public Discord contact should be exposed',
  );
  expect(
    defaultPublicSiteConfig.contact?.qq_group === '1095706752',
    'default public QQ group should be exposed',
  );

  const fastOnlyConfig = await updateRuntimeConfig({
    enabled: true,
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-ai/DeepSeek-V3.2',
    api_key_env_name: 'MISSING_PRIMARY_MODEL_KEY',
    temperature: 0.2,
    public_site: {
      contact: {
        discord_url: 'https://discord.gg/lingo-updated',
        email: 'support@lingo.ink',
        qq_group: '123456789',
      },
    },
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'Qwen/Qwen3-14B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate', 'rewrite'],
    },
  });
  expect(fastOnlyConfig.fast_lane?.enabled === true, 'fast lane config should round-trip');
  expect(
    fastOnlyConfig.fast_lane?.model === 'Qwen/Qwen3-14B',
    'fast lane model should be returned',
  );
  expect(
    fastOnlyConfig.public_site?.contact?.discord_url === 'https://discord.gg/lingo-updated',
    'admin runtime config should include public site contact summary',
  );

  const updatedPublicSiteConfig = await fetchPublicSiteConfig();
  expect(
    updatedPublicSiteConfig.contact?.discord_url === 'https://discord.gg/lingo-updated',
    'public site config should reflect updated Discord contact',
  );
  expect(
    updatedPublicSiteConfig.contact?.email === 'support@lingo.ink',
    'public site config should reflect updated email contact',
  );
  expect(
    updatedPublicSiteConfig.contact?.qq_group === '123456789',
    'public site config should reflect updated QQ group contact',
  );

  const fastOnlyResult = await translate({
    text: 'hello',
    translation_mode: 'pro',
    game_scene: 'dota2',
  });
  expect(fastOnlyResult.status === 200, 'fast-lane request should succeed without primary key');
  expect(fastOnlyResult.json.model_route === 'fast-lane', 'short request should use fast lane');
  expect(fastOnlyResult.json.translated_text === 'FAST:hello', 'fast lane response should be returned');
  expect(fastOnlyResult.json.style_profile === 'pro', 'style profile should be returned');
  expect(
    Number.isFinite(Number(fastOnlyResult.json.proxy_overhead_ms)),
    'proxy overhead should be returned',
  );
  expect(
    upstreamState.lastFastSystemPrompt.includes('Game:Dota 2'),
    'dota2 prompt should include explicit Dota 2 context',
  );
  expect(
    upstreamState.lastFastSystemPrompt.includes('Roshan'),
    'dota2 prompt should mention Dota 2 terminology',
  );
  expect(
    upstreamState.lastFastSystemPrompt.includes('Style:pro'),
    'pro prompt should include style profile',
  );

  const rewriteFast = await translate({
    text: 'clean it up and push',
    translation_from: 'en',
    translation_to: 'en',
    translation_mode: 'auto',
    game_scene: 'other',
  });
  expect(rewriteFast.status === 200, 'rewrite request should succeed');
  expect(rewriteFast.json.model_route === 'fast-lane', 'rewrite request should use fast lane');
  expect(rewriteFast.json.prompt_variant === 'rewrite', 'rewrite request should report rewrite variant');
  expect(
    upstreamState.lastFastSystemPrompt.includes('Rewrite in-game chat in English.'),
    'rewrite prompt should keep rewrite intent',
  );
  expect(
    upstreamState.lastFastSystemPrompt.includes('Do not force Dota 2, League of Legends, World of Warcraft, or Overwatch terminology.'),
    'other game prompt should avoid game-specific terminology',
  );

  const fallbackConfig = await updateRuntimeConfig({
    enabled: true,
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-ai/DeepSeek-V3.2',
    api_key_env_name: 'PRIMARY_MODEL_API_KEY',
    temperature: 0.2,
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'Qwen/Qwen3-14B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate', 'rewrite'],
    },
  });
  expect(fallbackConfig.model === 'deepseek-ai/DeepSeek-V3.2', 'primary model should round-trip');

  const firstFallback = await translate({ text: 'fallback once' });
  expect(firstFallback.status === 200, 'fallback request should still succeed');
  expect(firstFallback.json.model_route === 'fast-fallback', 'first request should fall back to primary');
  expect(
    firstFallback.json.translated_text === 'PRIMARY:fallback once',
    'fallback should return primary model content',
  );

  const secondFallback = await translate({ text: 'fallback once' });
  expect(secondFallback.status === 200, 'second request should succeed');
  expect(secondFallback.json.model_route === 'fast-lane', 'second request should retry fast lane');
  expect(
    secondFallback.json.translated_text === 'FAST-RECOVERED:fallback once',
    'second request should not reuse cached primary fallback',
  );
  expect(upstreamState.fastHits >= 3, 'fast lane should be retried after transient fallback');

  const toxicPrimary = await translate({
    text: 'stop feeding and play baron side',
    translation_mode: 'toxic',
    game_scene: 'lol',
  });
  expect(toxicPrimary.status === 200, 'toxic request should succeed');
  expect(toxicPrimary.json.model_route === 'primary', 'toxic request should stay on primary model');
  expect(toxicPrimary.json.style_profile === 'toxic', 'toxic style profile should be returned');
  expect(
    upstreamState.lastPrimarySystemPrompt.includes('Game:League of Legends'),
    'lol prompt should include explicit game context',
  );
  expect(
    upstreamState.lastPrimarySystemPrompt.includes('baron'),
    'lol prompt should mention League of Legends terminology',
  );
  expect(
    upstreamState.lastPrimarySystemPrompt.includes('Style:toxic'),
    'toxic prompt should include toxic style profile',
  );

  const disabledConfig = await updateRuntimeConfig({
    enabled: false,
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${fastPath}`,
      model_name: 'Qwen/Qwen3-14B',
      api_key_env_name: 'FAST_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate', 'rewrite'],
    },
  });
  expect(disabledConfig.enabled === false, 'updated config should disable service');

  const blockedResponse = await translate({ text: 'hello' });
  expect(blockedResponse.status === 503, 'disabled config should block translate requests');
  expect(blockedResponse.json.message === 'Translation service is disabled', 'disabled message should match');

  console.log('[smoke] translate proxy smoke test passed');
} finally {
  child.kill('SIGTERM');
  await wait(300);
  await new Promise((resolve) => upstream.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
