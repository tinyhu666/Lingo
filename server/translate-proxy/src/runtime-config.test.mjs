import assert from 'node:assert/strict';
import test from 'node:test';

import { environmentRuntimeConfig } from './runtime-config.mjs';

test('defaults to the official DeepSeek V4 Flash endpoint and server-side key', () => {
  const config = environmentRuntimeConfig({ FAST_MODEL_ENABLED: 'true' });

  assert.equal(config.provider, 'openai-compatible');
  assert.equal(config.api_url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(config.model_name, 'deepseek-v4-flash');
  assert.equal(config.api_key_env_name, 'DEEPSEEK_API_KEY');
  assert.equal(config.fast_lane.api_url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(config.fast_lane.model_name, 'deepseek-v4-flash');
  assert.equal(config.fast_lane.api_key_env_name, 'DEEPSEEK_API_KEY');
});
