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
const analyticsDbPath = path.join(tempDir, 'analytics.sqlite');
const port = 9797;
const upstreamPort = 9798;
const baseUrl = `http://127.0.0.1:${port}`;
const upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}`;
const proxyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const primaryPath = '/primary/v1/chat/completions';
const fastPath = '/fast/v1/chat/completions';
const secondaryPath = '/secondary/chat/completions';

const upstreamState = {
  primaryHits: 0,
  secondaryHits: 0,
  slowEmptyHits: 0,
  requestedModels: [],
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
  upstreamState.requestedModels.push(payload.model);

  if (req.url === primaryPath) {
    upstreamState.primaryHits += 1;
    upstreamState.lastPrimarySystemPrompt = systemPrompt;
    expect(auth === 'Bearer primary-model-key', 'primary model auth should use primary key');
    if (userText === 'slow empty primary' && payload.model === 'deepseek-v4-flash') {
      upstreamState.slowEmptyHits += 1;
      if (upstreamState.slowEmptyHits === 1) {
        await wait(1600);
        return jsonResponse(res, 200, { choices: [{ message: { content: '' } }] });
      }
      return; // The proxy must abort this retry within the original route budget.
    }
    if (userText.startsWith('provider outage')) {
      return jsonResponse(res, 503, { message: 'provider unavailable' });
    }
    if (userText === 'glm unavailable' && payload.model === 'deepseek-v4-flash') {
      return jsonResponse(res, 503, { message: 'Flash unavailable' });
    }
    if (userText === 'provider auth rejected') {
      return jsonResponse(res, 401, { message: 'invalid upstream credentials' });
    }
    if (userText === 'unchanged from both models') {
      return jsonResponse(res, 200, { choices: [{ message: { content: userText } }] });
    }
    if (userText === 'same upstream outage' && payload.model === 'deepseek-v4-flash') {
      return jsonResponse(res, 503, { message: 'same upstream temporary outage' });
    }
    if (userText === '你出蝴蝶吗？') {
      return jsonResponse(res, 200, {
        choices: [{ message: { content: payload.model === 'deepseek-v4-pro' ? 'Are you building Butterfly?' : userText } }],
      });
    }
    return jsonResponse(res, 200, {
      choices: [{ message: { content: `${payload.model === 'deepseek-v4-pro' ? 'PRO' : 'PRIMARY'}:${userText}` } }],
    });
  }

  if (req.url === secondaryPath) {
    upstreamState.secondaryHits += 1;
    expect(auth === 'Bearer secondary-model-key', 'secondary model must use its own key');
    expect(payload.model === 'glm-5.3-flash', 'secondary model ID must be forwarded');
    if (userText === 'provider outage all' || userText === 'glm unavailable') {
      return jsonResponse(res, 503, { message: 'secondary unavailable' });
    }
    return jsonResponse(res, 200, { choices: [{ message: { content: `GLM:${userText}` } }] });
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
    ZHIPU_API_KEY: 'secondary-model-key',
    RUNTIME_CONFIG_PATH: runtimeConfigPath,
    ANALYTICS_DB_PATH: analyticsDbPath,
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

let translationCounter = 0;

const translate = async (payloadOverrides = {}) => {
  translationCounter += 1;
  const operationId = `smoke-operation-${translationCounter}`;
  const response = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-public-key',
      'X-Lingo-Operation-Id': operationId,
      'X-Lingo-Client-Version': '0.9.14-smoke',
      'X-Lingo-Client-Platform': 'test',
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
    operationId,
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
    model_name: 'deepseek-v4-flash',
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
    upstreamState.lastFastSystemPrompt.includes('蝴蝶=Butterfly'),
    'dota2 prompt should disambiguate the Butterfly item',
  );
  expect(
    upstreamState.lastFastSystemPrompt.includes('Style:pro'),
    'pro prompt should include style profile',
  );

  const mixedLanguageResult = await translate({
    text: '你出 Butterfly 吗？',
    translation_from: 'zh',
    translation_to: 'en',
    game_scene: 'dota2',
  });
  expect(mixedLanguageResult.status === 200, 'mixed Chinese and English request should translate');
  expect(
    upstreamState.lastFastSystemPrompt.includes('Translate in-game chat from Chinese to English.'),
    'mixed input should preserve the configured translation direction',
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
    model_name: 'deepseek-v4-flash',
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
  expect(fallbackConfig.model === 'deepseek-v4-flash', 'primary model should round-trip');

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

  await updateRuntimeConfig({
    enabled: true,
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-v4-flash',
    api_key_env_name: 'PRIMARY_MODEL_API_KEY',
    temperature: 0.2,
    fallback: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${primaryPath}`,
      model_name: 'deepseek-v4-pro',
      api_key_env_name: 'PRIMARY_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 96,
      temperature: 0.2,
    },
    fast_lane: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: `${upstreamBaseUrl}${primaryPath}`,
      model_name: 'deepseek-v4-flash',
      api_key_env_name: 'PRIMARY_MODEL_API_KEY',
      timeout_ms: 5000,
      max_tokens: 48,
      temperature: 0.1,
      max_text_length: 72,
      allowed_prompt_variants: ['translate', 'rewrite'],
    },
  });

  const primaryHitsBeforeSameUpstreamFailure = upstreamState.primaryHits;
  const sameUpstreamFailure = await translate({ text: 'same upstream outage' });
  expect(sameUpstreamFailure.status === 200, 'same-upstream Flash failure should use V4 Pro');
  expect(
    sameUpstreamFailure.json.model_route === 'fast-pro-fallback',
    'same-upstream Flash failure should report the Pro fallback route',
  );
  expect(
    sameUpstreamFailure.json.translated_text === 'PRO:same upstream outage',
    'Pro fallback content should be returned',
  );
  expect(
    upstreamState.primaryHits === primaryHitsBeforeSameUpstreamFailure + 2,
    'same-upstream failure should call Flash once and Pro once without retrying Flash',
  );

  const unchangedItemResult = await translate({
    text: '你出蝴蝶吗？',
    translation_from: 'zh',
    translation_to: 'en',
    game_scene: 'dota2',
  });
  expect(unchangedItemResult.status === 200, 'unchanged Flash output should use V4 Pro');
  expect(
    unchangedItemResult.json.model_route === 'fast-pro-fallback',
    'unchanged Flash output should report the Pro fallback route',
  );
  expect(
    unchangedItemResult.json.translated_text === 'Are you building Butterfly?',
    'Dota 2 item question should use the canonical Butterfly item name',
  );

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
    upstreamState.lastPrimarySystemPrompt.includes('Baron'),
    'lol prompt should mention League of Legends terminology',
  );
  expect(
    upstreamState.lastPrimarySystemPrompt.includes('Style:toxic'),
    'toxic prompt should include toxic style profile',
  );

  const chainConfig = {
    fast_lane: { enabled: false },
    provider: 'openai-compatible',
    api_url: `${upstreamBaseUrl}${primaryPath}`,
    model_name: 'deepseek-v4-flash',
    api_key_env_name: 'PRIMARY_MODEL_API_KEY',
    fallback: {
      enabled: true,
      model_name: 'deepseek-v4-pro',
    },
    secondary_fallback: {
      enabled: true,
      api_url: `${upstreamBaseUrl}${secondaryPath}`,
      model_name: 'glm-5.3-flash',
      api_key_env_name: 'ZHIPU_API_KEY',
      timeout_ms: 3000,
    },
  };
  const chainSummary = await updateRuntimeConfig(chainConfig);
  expect(chainSummary.secondary_fallback?.model === 'glm-5.3-flash', 'secondary config should persist');
  const beforeChain = upstreamState.primaryHits;
  const chain = await translate({ text: 'provider outage primary' });
  expect(chain.status === 200 && chain.json.translated_text === 'GLM:provider outage primary', 'both DeepSeek failures must reach GLM');
  expect(chain.json.model_route === 'primary-pro-fallback-secondary', 'secondary route must be identifiable');
  expect(chain.json.attempt_count === 3, 'all three attempts must be counted');
  expect(upstreamState.primaryHits === beforeChain + 2, 'both DeepSeek models must be attempted first');
  const beforeRecovery = upstreamState.secondaryHits;
  await translate({ text: 'provider recovered' });
  expect(upstreamState.secondaryHits === beforeRecovery, 'healthy primary must not call GLM');
  const unchangedChain = await translate({ text: 'unchanged from both models' });
  expect(unchangedChain.status === 200 && unchangedChain.json.model === 'glm-5.3-flash', 'unchanged text from both models must reach GLM');
  const allFailed = await translate({ text: 'provider outage all' });
  expect(allFailed.status === 503, 'exhausted chain must return failure');
  const beforeAuth = upstreamState.secondaryHits;
  const authFailed = await translate({ text: 'provider auth rejected' });
  expect(authFailed.status === 401 && upstreamState.secondaryHits === beforeAuth, 'non-retryable errors must retain existing behavior');
  await updateRuntimeConfig({ ...chainConfig, fallback: { ...chainConfig.fallback, api_key_env_name: 'MISSING_FALLBACK_KEY' } });
  const missingFirstKey = await translate({ text: 'provider outage missing first key' });
  expect(missingFirstKey.status === 200 && missingFirstKey.json.model === 'glm-5.3-flash', 'missing first fallback key must not block secondary');
  await updateRuntimeConfig({ ...chainConfig, secondary_fallback: { ...chainConfig.secondary_fallback, enabled: false } });
  const disabledSecondary = await translate({ text: 'provider outage disabled secondary' });
  expect(disabledSecondary.status === 503, 'disabled secondary must not be called');
  await updateRuntimeConfig({ ...chainConfig, secondary_fallback: { ...chainConfig.secondary_fallback, api_key_env_name: 'MISSING_SECONDARY_KEY' } });
  const missingSecondary = await translate({ text: 'provider outage missing secondary key' });
  expect(missingSecondary.status === 503, 'missing secondary credentials must preserve upstream failure');
  await updateRuntimeConfig({ ...chainConfig, fast_lane: { enabled: true, model_name: 'deepseek-v4-flash' } });
  const fastChain = await translate({ text: 'provider outage fast lane' });
  expect(fastChain.status === 200 && fastChain.json.model_route === 'fast-pro-fallback-secondary', 'same-model fast lane must reach secondary without repeating Flash');
  expect(fastChain.json.attempt_count === 3, 'fast lane chain must count Flash, Pro, GLM once each');

  await updateRuntimeConfig({
    ...chainConfig,
    fallback: chainConfig.secondary_fallback,
    secondary_fallback: { ...chainConfig.fallback, enabled: true },
  });
  const priorityStart = upstreamState.primaryHits;
  const glmFirst = await translate({ text: 'provider outage glm preferred' });
  expect(glmFirst.status === 200 && glmFirst.json.model === 'glm-5.3-flash', 'GLM must precede Pro when configured first');
  expect(glmFirst.json.model_route === 'primary-fallback' && glmFirst.json.attempt_count === 2, 'GLM first fallback diagnostics must be accurate');
  expect(upstreamState.primaryHits === priorityStart + 1, 'Pro must not run after GLM succeeds');

  const priorityCalls = upstreamState.requestedModels.length;
  const glmUnavailable = await translate({ text: 'glm unavailable' });
  expect(glmUnavailable.status === 200 && glmUnavailable.json.model === 'deepseek-v4-pro', 'Pro must rescue failed GLM');
  expect(JSON.stringify(upstreamState.requestedModels.slice(priorityCalls)) === JSON.stringify(['deepseek-v4-flash', 'glm-5.3-flash', 'deepseek-v4-pro']), 'production priority must be Flash, GLM, Pro');

  await updateRuntimeConfig({ ...chainConfig, timeout_ms: 3000 });
  const retryBudgetStarted = Date.now();
  const slowEmpty = await translate({ text: 'slow empty primary' });
  expect(slowEmpty.status === 200, 'a timed-out empty response retry must reach fallback');
  expect(slowEmpty.json.attempt_count === 3, 'empty response, bounded retry and fallback must be counted');
  expect(Date.now() - retryBudgetStarted < 4200, 'empty retries must share their route timeout budget');

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
  expect(
    blockedResponse.json.operation_id === blockedResponse.operationId,
    'translate response should echo the operation id',
  );

  const diagnosticResponse = await fetch(
    `${baseUrl}/admin/translation-diagnostics?operation_id=${blockedResponse.operationId}`,
    { headers: { Authorization: 'Bearer test-admin-token' } },
  );
  const diagnosticPayload = await diagnosticResponse.json();
  expect(diagnosticResponse.ok, 'server translation diagnostic should be queryable');
  expect(diagnosticPayload.count === 1, 'disabled request should create one server diagnostic');
  expect(
    diagnosticPayload.diagnostics[0].error_code === 'service_disabled',
    'server diagnostic should preserve the failure classification',
  );
  expect(
    diagnosticPayload.diagnostics[0].trace_id === blockedResponse.json.trace_id,
    'server diagnostic should link operation id and trace id',
  );

  console.log('[smoke] translate proxy smoke test passed');
} finally {
  child.kill('SIGTERM');
  await wait(300);
  await new Promise((resolve) => upstream.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
