import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homeSource = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../../components/Sidebar.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

test('home keeps the master toggle on top, the demo stage in the middle and the quick controls at the bottom', () => {
  const homeBody = homeSource.slice(homeSource.indexOf('export default function Home'));
  const positions = [
    homeBody.indexOf('<EnableCard'),
    homeBody.indexOf('<DemoStage'),
    homeBody.indexOf('<GameSceneCard />'),
    homeBody.indexOf('<DirectionCard />'),
    homeBody.indexOf('<HotkeyCard />'),
  ];

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('home no longer renders incoming-translation controls', () => {
  assert.doesNotMatch(homeSource, /incoming/i);
  assert.doesNotMatch(homeSource, /Calibration|ClickThrough/);
});

test('hotkey recorder is a single click-to-record control', () => {
  assert.match(homeSource, /className=\{recorderClass\}/);
  assert.match(homeSource, /onClick=\{recording \? cancelRecording : beginRecording\}/);
  assert.match(styles, /\.hotkey-rec--recording\s*\{/);
});

test('sidebar service state is rendered as a bottom footer with the theme switch', () => {
  assert.match(sidebarSource, /className='lg-side-footer'/);
  assert.match(sidebarSource, /lg-theme-switch/);
  assert.match(styles, /\.lg-side-footer\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(styles, /\.lg-side-status\s*\{[^}]*border-top:/s);
});

test('theme defaults to dark and light is opt-in', () => {
  const store = readFileSync(new URL('../../services/settingsStore.js', import.meta.url), 'utf8');
  assert.match(store, /DEFAULT_UI_THEME = 'dark'/);
  assert.match(styles, /^:root \{\s*\n\s*color-scheme: dark;/m);
  assert.match(styles, /:root\[data-theme="light"\]/);
});
