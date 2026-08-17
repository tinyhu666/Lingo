import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homeSource = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../../components/Sidebar.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

test('home settings use the requested two-by-two reading order', () => {
  const homeBody = homeSource.slice(homeSource.indexOf('export default function Home'));
  const positions = [
    homeBody.indexOf('<EnableCard />'),
    homeBody.indexOf('<GameSceneCard />'),
    homeBody.indexOf('<DirectionCard />'),
    homeBody.indexOf('<HotkeyCard />'),
  ];

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.doesNotMatch(homeBody, /home-main-grid__wide/);
});

test('sidebar service state is rendered as a bottom footer, not a floating card', () => {
  assert.match(sidebarSource, /className='lg-side-footer'/);
  assert.match(styles, /\.lg-side-footer\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(styles, /\.lg-side-status\s*\{[^}]*border-top:/s);
});
