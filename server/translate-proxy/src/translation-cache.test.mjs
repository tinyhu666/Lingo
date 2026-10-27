import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationCache } from './translation-cache.mjs';

test('reuses repeated callouts past 15 seconds but expires at one minute, even with hits', () => {
  let now = 0;
  const cache = createTranslationCache({ now: () => now });
  cache.set('same request', 'translation');
  now = 20_000;
  assert.equal(cache.get('same request'), 'translation');
  now = 59_999;
  assert.equal(cache.get('same request'), 'translation');
  now = 60_000;
  assert.equal(cache.get('same request'), null);
});

test('cache stays bounded and evicts the least recently used result', () => {
  const cache = createTranslationCache({ maxEntries: 2 });
  cache.set('a', 'A');
  cache.set('b', 'B');
  assert.equal(cache.get('a'), 'A');
  cache.set('c', 'C');
  assert.equal(cache.get('b'), null);
  cache.set('a', 'new A');
  assert.equal(cache.get('c'), 'C');
  assert.equal(cache.get('a'), 'new A');
});

test('expired entries are removed before evicting a live entry', () => {
  let now = 0;
  const cache = createTranslationCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  cache.set('old', 'old');
  now = 50;
  cache.set('live', 'live');
  cache.get('old');
  now = 100;
  cache.set('new', 'new');
  assert.equal(cache.get('old'), null);
  assert.equal(cache.get('live'), 'live');
});
