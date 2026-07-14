import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateOverlayPosition } from './positioning.js';

const game = { x: 0, y: 0, w: 3840, h: 2160 };
const display = { x: 0, y: 0, w: 3840, h: 2160 };
const overlay = { w: 540, h: 900 };

test('right anchor uses physical pixels and stays inside a fullscreen game', () => {
  assert.deepEqual(
    calculateOverlayPosition({ game, display, overlay, anchor: 'right', gap: 18 }),
    { x: 3282, y: 0 },
  );
});

test('all anchors clamp into the physical display bounds', () => {
  assert.deepEqual(
    calculateOverlayPosition({ game, display, overlay, anchor: 'left', gap: 18 }),
    { x: 18, y: 0 },
  );
  assert.deepEqual(
    calculateOverlayPosition({ game, display, overlay, anchor: 'top', gap: 18 }),
    { x: 0, y: 18 },
  );
  assert.deepEqual(
    calculateOverlayPosition({ game, display, overlay, anchor: 'bottom', gap: 18 }),
    { x: 0, y: 1242 },
  );
});

test('secondary-monitor origins remain in global physical coordinates', () => {
  assert.deepEqual(
    calculateOverlayPosition({
      game: { x: 3840, y: -120, w: 2560, h: 1440 },
      display: { x: 3840, y: -120, w: 2560, h: 1440 },
      overlay: { w: 360, h: 600 },
      anchor: 'right',
      gap: 12,
    }),
    { x: 6028, y: -120 },
  );
});
