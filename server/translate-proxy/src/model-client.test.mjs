import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelClient } from './model-client.mjs';

const config = {
  provider: 'openai-compatible',
  api_url: 'https://example.com/v1/chat/completions',
  model_name: 'mock-model',
  timeout_ms: 5_000,
};

const quiet = { warn() {}, error() {} };

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

const completion = (content, finishReason = 'stop') =>
  jsonResponse({ choices: [{ message: { content }, finish_reason: finishReason }] });

// A fetch stub whose responses can be delayed and that honors abort signals.
const scriptedFetch = (script) => {
  const calls = [];
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      const index = calls.length;
      const body = JSON.parse(init.body);
      calls.push({ url, body, aborted: false });
      const step = script[Math.min(index, script.length - 1)];
      const timer = setTimeout(() => resolve(step.response), step.delayMs || 0);
      init.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        calls[index].aborted = true;
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  return { fetchImpl, calls };
};

const baseRequest = {
  config,
  apiKey: 'key',
  systemPrompt: 'translate',
  text: '兄弟们集合打肉山',
  traceId: 't',
  effectiveMaxTokens: 30,
  effectiveTemperature: 0.1,
};

test('a hedged duplicate wins when the first call is slow, and the loser is aborted', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { delayMs: 400, response: completion('slow answer') },
    { delayMs: 10, response: completion('fast answer') },
  ]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const result = await client.requestModel({ ...baseRequest, hedgeAfterMs: 50 });
  assert.equal(result.translatedText, 'fast answer');
  assert.equal(result.hedged, true);
  assert.equal(result.attemptCount, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].aborted, true, 'the slow primary call is cancelled');
  assert.deepEqual(calls[0].body, calls[1].body, 'the hedge repeats the exact request');
});

test('no hedge is sent when the first call answers in time', async () => {
  const { fetchImpl, calls } = scriptedFetch([{ delayMs: 10, response: completion('answer') }]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const result = await client.requestModel({ ...baseRequest, hedgeAfterMs: 200 });
  assert.equal(result.translatedText, 'answer');
  assert.equal(result.hedged, false);
  assert.equal(result.attemptCount, 1);
  assert.equal(calls.length, 1);
});

test('hedging is off by default and when the budget cannot fit a second call', async () => {
  const { fetchImpl, calls } = scriptedFetch([{ delayMs: 120, response: completion('answer') }]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  await client.requestModel({ ...baseRequest });
  await client.requestModel({ ...baseRequest, config: { ...config, timeout_ms: 300 }, hedgeAfterMs: 400 });
  assert.equal(calls.length, 2);
});

test('when the primary fails after the hedge started, the hedge answer is used', async () => {
  const { fetchImpl } = scriptedFetch([
    { delayMs: 80, response: jsonResponse({ message: 'upstream exploded' }, 503) },
    { delayMs: 150, response: completion('hedge answer') },
  ]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const result = await client.requestModel({ ...baseRequest, hedgeAfterMs: 20 });
  assert.equal(result.translatedText, 'hedge answer');
  assert.equal(result.hedged, true);
});

test('a primary failure before the hedge timer fires is surfaced without a duplicate', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { delayMs: 5, response: jsonResponse({ message: 'bad key' }, 401) },
  ]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  await assert.rejects(client.requestModel({ ...baseRequest, hedgeAfterMs: 500 }), /bad key/);
  assert.equal(calls.length, 1);
});

test('a cut-off answer is retried once with a larger budget, capped by the ceiling', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { response: completion('group up, let', 'length') },
    { response: completion("group up, let's do rosh") },
  ]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const result = await client.requestModel({ ...baseRequest, maxTokensCeiling: 96 });
  assert.equal(result.translatedText, "group up, let's do rosh");
  assert.equal(result.widenedTokens, 60);
  assert.equal(result.attemptCount, 2);
  assert.equal(calls[1].body.max_tokens, 60);
});

test('a cut-off answer at the ceiling is returned as is, and a failed retry keeps the first answer', async () => {
  const atCeiling = scriptedFetch([{ response: completion('cut', 'length') }]);
  const result = await createModelClient({ fetchImpl: atCeiling.fetchImpl, logger: quiet }).requestModel({
    ...baseRequest,
    maxTokensCeiling: 30,
  });
  assert.equal(result.translatedText, 'cut');
  assert.equal(atCeiling.calls.length, 1);

  const failedRetry = scriptedFetch([
    { response: completion('cut', 'length') },
    { response: jsonResponse({ message: 'busy' }, 503) },
  ]);
  const kept = await createModelClient({ fetchImpl: failedRetry.fetchImpl, logger: quiet }).requestModel({
    ...baseRequest,
    maxTokensCeiling: 96,
  });
  assert.equal(kept.translatedText, 'cut');
});

test('an empty answer is retried once with an explicit instruction', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { response: completion('') },
    { response: completion('second try') },
  ]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const result = await client.requestModel({ ...baseRequest });
  assert.equal(result.translatedText, 'second try');
  assert.equal(result.attemptCount, 2);
  assert.match(calls[1].body.messages[0].content, /Never return an empty response/);
});

test('the whole policy shares one deadline', async () => {
  const { fetchImpl } = scriptedFetch([{ delayMs: 1_000, response: completion('late') }]);
  const client = createModelClient({ fetchImpl, logger: quiet });
  const started = Date.now();
  await assert.rejects(
    client.requestModel({ ...baseRequest, config: { ...config, timeout_ms: 120 } }),
    (error) => error.name === 'AbortError',
  );
  assert.ok(Date.now() - started < 600);
});
