import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourcePng = join(repoRoot, 'icon2048.png');
const appIconSvgPath = join(repoRoot, 'assets/lingo-app-icon.svg');
const horizontalLogoSvgPath = join(repoRoot, 'assets/lingo-logo-horizontal.svg');
const badgeSvgPath = join(repoRoot, 'assets/lingo-translation-game-badge.svg');
const tauriIconsDir = join(repoRoot, 'src-tauri/icons');
const appIconRoot = join(repoRoot, 'app-icon.png');
const appIconSrc = join(repoRoot, 'src/assets/app-icon.png');
const faviconPath = join(repoRoot, 'public/favicon.png');
const websiteRoot = resolve(repoRoot, '../lingoweb');
const websiteExists = existsSync(join(websiteRoot, 'package.json'));
const websiteAppIconSvgPath = join(websiteRoot, 'src/assets/lingo-app-icon.svg');
const websiteLogoSvgPath = join(websiteRoot, 'src/assets/lingo-logo-horizontal.svg');
const websiteAppIconPngPath = join(websiteRoot, 'src/assets/app-icon.png');
const websiteFaviconIcoPath = join(websiteRoot, 'public/favicon.ico');
const websiteOgImagePngPath = join(websiteRoot, 'public/og-image.png');
const redundantTauriOutputs = [
  join(tauriIconsDir, '1024x1024.png'),
  join(tauriIconsDir, '256x256.png'),
  join(tauriIconsDir, '512x512.png'),
  join(tauriIconsDir, 'android/mipmap-anydpi-v26'),
  join(tauriIconsDir, 'android/values'),
];
const cachedBundleIconPaths = [
  join(repoRoot, 'src-tauri/target/debug/resources/icon.ico'),
  join(repoRoot, 'src-tauri/target/debug/resources/icon.icns'),
  join(repoRoot, 'src-tauri/target/debug/resources/icon.png'),
  join(repoRoot, 'src-tauri/target/release/resources/icon.ico'),
  join(repoRoot, 'src-tauri/target/release/resources/icon.icns'),
  join(repoRoot, 'src-tauri/target/release/resources/icon.png'),
];

const APP_ICON_VIEWBOX = '334 620 1380 828';
const BRAND_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif';
const sourcePngDataUri = `data:image/png;base64,${readFileSync(sourcePng).toString('base64')}`;

const run = (command, args, options = {}) => {
  const usesWindowsShell = process.platform === 'win32' && command === 'npx';
  const result = usesWindowsShell
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: repoRoot,
        stdio: 'inherit',
        ...options,
      })
    : spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        ...options,
      });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const printableCommand = [command, ...args].join(' ');
    throw new Error(`Command failed: ${printableCommand}`);
  }
};

if (!existsSync(sourcePng)) {
  throw new Error(`Missing brand source PNG: ${sourcePng}`);
}

const ensureParentDir = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const writeTextFile = (filePath, content) => {
  ensureParentDir(filePath);
  writeFileSync(filePath, content);
};

const brandIcon = ({ x, y, width, height }) => `
  <svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${APP_ICON_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <image href="${sourcePngDataUri}" x="0" y="0" width="2048" height="2048" preserveAspectRatio="xMidYMid meet" />
  </svg>`;

const buildAppIconSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="appTileBg" x1="132" y1="112" x2="892" y2="936" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7FBFF" />
      <stop offset="0.34" stop-color="#EDF4FF" />
      <stop offset="0.76" stop-color="#DCE7FF" />
      <stop offset="1" stop-color="#C5D6F6" />
    </linearGradient>
    <linearGradient id="appTileOverlay" x1="118" y1="94" x2="926" y2="956" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.82" />
      <stop offset="0.42" stop-color="#E8F1FF" stop-opacity="0.2" />
      <stop offset="1" stop-color="#8EAFFF" stop-opacity="0.12" />
    </linearGradient>
    <linearGradient id="appTileStroke" x1="132" y1="112" x2="892" y2="936" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9" />
      <stop offset="1" stop-color="#8EA6D9" stop-opacity="0.78" />
    </linearGradient>
  </defs>

  <rect x="72" y="72" width="880" height="880" rx="246" fill="url(#appTileBg)" />
  <rect x="72" y="72" width="880" height="880" rx="246" fill="url(#appTileOverlay)" />
  <rect x="72.5" y="72.5" width="879" height="879" rx="245.5" stroke="url(#appTileStroke)" stroke-width="1" />
  ${brandIcon({ x: 150, y: 291, width: 724, height: 434 })}
</svg>
`;

const buildHorizontalLogoSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="320" viewBox="0 0 1200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lingoWordmark" x1="340" y1="86" x2="760" y2="232" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#111827" />
      <stop offset="0.52" stop-color="#2947A7" />
      <stop offset="1" stop-color="#6E50DB" />
    </linearGradient>
  </defs>

  ${brandIcon({ x: 20, y: 74, width: 280, height: 168 })}

  <text
    x="324"
    y="196"
    fill="url(#lingoWordmark)"
    font-size="126"
    font-family="${BRAND_FONT_STACK}"
    font-weight="700"
    letter-spacing="-4"
  >
    Lingo
  </text>
</svg>
`;

const buildBadgeSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="320" height="96" viewBox="0 0 320 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeBg" x1="20" y1="8" x2="298" y2="104" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8FBFF" />
      <stop offset="1" stop-color="#E7EEFF" />
    </linearGradient>
    <linearGradient id="badgeWordmark" x1="102" y1="28" x2="220" y2="68" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#111827" />
      <stop offset="0.52" stop-color="#2947A7" />
      <stop offset="1" stop-color="#6E50DB" />
    </linearGradient>
  </defs>

  <rect x="4" y="4" width="312" height="88" rx="44" fill="url(#badgeBg)" stroke="#6983D6" stroke-opacity="0.28" stroke-width="2" />
  ${brandIcon({ x: 14, y: 20, width: 96, height: 58 })}

  <text
    x="120"
    y="58"
    fill="url(#badgeWordmark)"
    font-size="36"
    font-family="${BRAND_FONT_STACK}"
    font-weight="700"
    letter-spacing="-1.2"
  >
    Lingo
  </text>
</svg>
`;

const tempDir = mkdtempSync(join(tmpdir(), 'lingo-brand-'));

try {
  writeTextFile(appIconSvgPath, buildAppIconSvg());
  writeTextFile(horizontalLogoSvgPath, buildHorizontalLogoSvg());
  writeTextFile(badgeSvgPath, buildBadgeSvg());

  run('npx', ['tauri', 'icon', appIconSvgPath, '-o', tauriIconsDir]);
  run('npx', ['tauri', 'icon', appIconSvgPath, '-o', tempDir, '-p', '1024', '-p', '256']);

  copyFileSync(join(tempDir, '1024x1024.png'), appIconRoot);
  copyFileSync(join(tempDir, '1024x1024.png'), appIconSrc);
  copyFileSync(join(tempDir, '256x256.png'), faviconPath);
  copyFileSync(join(tauriIconsDir, 'icon.png'), join(tauriIconsDir, 'window.png'));
  copyFileSync(join(tauriIconsDir, 'icon.png'), join(tauriIconsDir, 'quit.png'));
  redundantTauriOutputs.forEach((targetPath) => {
    rmSync(targetPath, { recursive: true, force: true });
  });
  cachedBundleIconPaths.forEach((targetPath) => {
    rmSync(targetPath, { force: true });
  });

  if (websiteExists) {
    copyFileSync(appIconSvgPath, websiteAppIconSvgPath);
    copyFileSync(horizontalLogoSvgPath, websiteLogoSvgPath);
    copyFileSync(join(tempDir, '1024x1024.png'), websiteAppIconPngPath);
    copyFileSync(join(tauriIconsDir, 'icon.ico'), websiteFaviconIcoPath);
    copyFileSync(join(tempDir, '1024x1024.png'), websiteOgImagePngPath);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
