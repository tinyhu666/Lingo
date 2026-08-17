import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCosCopySource, mapWithConcurrency } from './cos-release-helpers.mjs';

test('buildCosCopySource preserves object paths and encodes file names', () => {
  assert.equal(
    buildCosCopySource('lingo-1259551686', 'ap-shanghai', 'releases/v1.2.3/Lingo setup.exe'),
    'lingo-1259551686.cos.ap-shanghai.myqcloud.com/releases/v1.2.3/Lingo%20setup.exe',
  );
});

test('mapWithConcurrency never exceeds the configured limit', async () => {
  let active = 0;
  let maximumActive = 0;
  const completed = [];

  await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed.push(value);
    active -= 1;
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(completed.toSorted(), [1, 2, 3, 4, 5]);
});
