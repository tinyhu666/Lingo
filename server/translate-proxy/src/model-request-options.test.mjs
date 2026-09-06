import assert from 'node:assert/strict';
import test from 'node:test';
import { modelRequestOptions } from './model-request-options.mjs';

test('official GLM Flash uses light reasoning with a budget for both reasoning and translation', () => {
  const config = { api_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model_name: 'glm-5.3-flash' };
  assert.deepEqual(modelRequestOptions(config, 30, 0.1), {
    max_tokens: 1024, temperature: 1, thinking: { type: 'enabled' }, reasoning_effort: 'low',
  });
  assert.equal(modelRequestOptions(config, 2048, 0.1).max_tokens, 2048);
});

test('existing DeepSeek and other OpenAI-compatible settings remain unchanged', () => {
  assert.deepEqual(modelRequestOptions({ api_url: 'https://api.deepseek.com/v1/chat/completions', model_name: 'deepseek-v4-flash' }, 30, 0.1), {
    max_tokens: 30, temperature: 0.1, thinking: { type: 'disabled' },
  });
  assert.deepEqual(modelRequestOptions({ api_url: 'https://example.com/chat/completions', model_name: 'glm-5.3-flash' }, 30, 0.1), {
    max_tokens: 30, temperature: 0.1,
  });
});
