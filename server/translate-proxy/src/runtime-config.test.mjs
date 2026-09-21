import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  environmentRuntimeConfig,
  loadRuntimeConfig,
  persistRuntimeConfig,
  sanitizeRuntimeConfig,
  summarizeRuntimeConfig,
} from './runtime-config.mjs';

test('defaults to the official DeepSeek V4.1 Flash endpoint and server-side key', () => {
  const config = environmentRuntimeConfig({ FAST_MODEL_ENABLED: 'true' });

  assert.equal(config.provider, 'openai-compatible');
  assert.equal(config.api_url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(config.model_name, 'deepseek-flash');
  assert.equal(config.api_key_env_name, 'DEEPSEEK_API_KEY');
  assert.equal(config.fallback.enabled, true);
  assert.equal(config.fallback.model_name, 'deepseek-v4-pro');
  assert.equal(config.fallback.api_key_env_name, 'DEEPSEEK_API_KEY');
  assert.equal(config.secondary_fallback.enabled, false);
  assert.equal(config.secondary_fallback.model_name, '');
  assert.equal(config.secondary_fallback.api_key_env_name, 'DEEPSEEK_API_KEY');
  assert.equal(config.fast_lane.api_url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(config.fast_lane.model_name, 'deepseek-flash');
  assert.equal(config.fast_lane.api_key_env_name, 'DEEPSEEK_API_KEY');
});

test('keeps secondary fallback disabled for existing configs without that field', () => {
  const config = sanitizeRuntimeConfig({
    provider: 'openai-compatible',
    api_url: 'https://api.deepseek.com/v1',
    model_name: 'deepseek-v4-flash',
    fallback: {
      enabled: true,
      model_name: 'deepseek-v4-pro',
    },
  });

  assert.equal(config.fallback.enabled, true);
  assert.equal(config.fallback.model_name, 'deepseek-v4-pro');
  assert.equal(config.secondary_fallback.enabled, false);
  assert.equal(config.secondary_fallback.model_name, '');
});

test('requires explicit enablement and model name for secondary fallback', () => {
  const enabled = sanitizeRuntimeConfig({
    secondary_fallback: {
      enabled: true,
      model_name: 'glm-5.3-flash',
      api_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      api_key_env_name: 'ZHIPU_API_KEY',
    },
  });
  const missingModel = sanitizeRuntimeConfig({
    secondary_fallback: {
      enabled: true,
      model_name: '',
      api_key_env_name: 'ZHIPU_API_KEY',
    },
  });
  const implicit = sanitizeRuntimeConfig({
    secondary_fallback: {
      model_name: 'glm-5.3-flash',
      api_key_env_name: 'ZHIPU_API_KEY',
    },
  });

  assert.equal(enabled.secondary_fallback.enabled, true);
  assert.equal(enabled.secondary_fallback.model_name, 'glm-5.3-flash');
  assert.equal(
    enabled.secondary_fallback.api_url,
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  );
  assert.equal(enabled.secondary_fallback.api_key_env_name, 'ZHIPU_API_KEY');
  assert.equal(missingModel.secondary_fallback.enabled, false);
  assert.equal(missingModel.secondary_fallback.model_name, '');
  assert.equal(implicit.secondary_fallback.enabled, false);
  assert.equal(implicit.secondary_fallback.model_name, 'glm-5.3-flash');
});

test('persists and loads secondary fallback config', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lingo-runtime-config-'));
  const env = {
    RUNTIME_CONFIG_PATH: path.join(directory, 'runtime-config.json'),
  };

  await persistRuntimeConfig(env, {
    model_name: 'deepseek-v4-flash',
    secondary_fallback: {
      enabled: true,
      provider: 'openai-compatible',
      api_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model_name: 'glm-5.3-flash',
      api_key_env_name: 'ZHIPU_API_KEY',
      timeout_ms: 9000,
      max_tokens: 128,
      temperature: 0.3,
    },
  });

  const raw = JSON.parse(await readFile(env.RUNTIME_CONFIG_PATH, 'utf8'));
  const loaded = await loadRuntimeConfig(env, { forceReload: true });

  assert.deepEqual(raw.secondary_fallback, {
    enabled: true,
    provider: 'openai-compatible',
    api_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model_name: 'glm-5.3-flash',
    api_key_env_name: 'ZHIPU_API_KEY',
    timeout_ms: 9000,
    max_tokens: 128,
    temperature: 0.3,
  });
  assert.equal(loaded.secondary_fallback.enabled, true);
  assert.equal(loaded.secondary_fallback.model_name, 'glm-5.3-flash');
  assert.equal(loaded.secondary_fallback.api_key_env_name, 'ZHIPU_API_KEY');
});

test('summarizes secondary fallback without exposing key names or values', () => {
  const config = sanitizeRuntimeConfig({
    api_key_env_name: 'PRIMARY_SECRET_ENV',
    fallback: {
      api_key_env_name: 'FALLBACK_SECRET_ENV',
    },
    secondary_fallback: {
      enabled: true,
      model_name: 'glm-5.3-flash',
      api_key_env_name: 'SECONDARY_SECRET_ENV',
    },
  });

  const summary = summarizeRuntimeConfig(config);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.secondary_fallback.enabled, true);
  assert.equal(summary.secondary_fallback.model, 'glm-5.3-flash');
  assert.equal(serialized.includes('PRIMARY_SECRET_ENV'), false);
  assert.equal(serialized.includes('FALLBACK_SECRET_ENV'), false);
  assert.equal(serialized.includes('SECONDARY_SECRET_ENV'), false);
  assert.equal(serialized.includes('api_key'), false);
});
