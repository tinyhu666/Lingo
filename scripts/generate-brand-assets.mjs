import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
const rootIconSvgPath = join(repoRoot, 'icon.svg');
const tauriIconsDir = join(repoRoot, 'src-tauri/icons');
const appIconRoot = join(repoRoot, 'app-icon.png');
const appIconSrc = join(repoRoot, 'src/assets/app-icon.png');
const faviconPath = join(repoRoot, 'public/favicon.png');
const websiteRoot = resolve(repoRoot, '../lingoweb');
const websiteExists =
  process.env.LINGO_SYNC_WEBSITE_BRAND === '1' && existsSync(join(websiteRoot, 'package.json'));
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

const BRAND_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif';

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
  writeFileSync(filePath, content.replace(/[ \t]+$/gm, ''));
};

const iconDefs = (prefix = 'lingoIcon') => `
  <linearGradient id="${prefix}Back" x1="592" y1="408" x2="820" y2="840" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#47D9FF" />
    <stop offset="0.45" stop-color="#189CFF" />
    <stop offset="1" stop-color="#075BE8" />
  </linearGradient>
  <linearGradient id="${prefix}Front" x1="168" y1="182" x2="728" y2="640" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#D7FAFF" />
    <stop offset="0.52" stop-color="#8BDDFF" />
    <stop offset="1" stop-color="#4CB8FF" />
  </linearGradient>
  <linearGradient id="${prefix}Pad" x1="262" y1="308" x2="642" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1BD5FF" />
    <stop offset="0.5" stop-color="#078BFF" />
    <stop offset="1" stop-color="#0649D6" />
  </linearGradient>
  <filter id="${prefix}Shadow" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
    <feDropShadow dx="18" dy="24" stdDeviation="18" flood-color="#0546B8" flood-opacity="0.28" />
  </filter>`;

const vectorIcon = (prefix = 'lingoIcon') => `
  <g filter="url(#${prefix}Shadow)">
    <path d="M578 464c0-96 78-174 174-174h60c96 0 174 78 174 174v110c0 96-78 174-174 174h-54l116 154-234-154h-62c-96 0-174-78-174-174V464Z" fill="url(#${prefix}Back)" stroke="#0A63DC" stroke-width="36" stroke-linejoin="round" />
    <path d="M126 318c0-132 107-239 239-239h284c132 0 239 107 239 239v83c0 132-107 239-239 239H376L164 792l70-170c-65-41-108-113-108-195V318Z" fill="url(#${prefix}Front)" stroke="#0A63DC" stroke-width="38" stroke-linejoin="round" />
    <path d="M126 318c0-132 107-239 239-239h284c132 0 239 107 239 239v83c0 132-107 239-239 239H376L164 792l70-170c-65-41-108-113-108-195V318Z" fill="none" stroke="#45D8FF" stroke-width="10" stroke-linejoin="round" opacity="0.78" />
    <path d="M266 363c18-77 67-104 132-82 18 6 27-19 52-19h114c25 0 34 25 52 19 65-22 114 5 132 82 17 72 6 163-36 207-39 41-95 8-119-42H421c-24 50-80 83-119 42-42-44-53-135-36-207Z" fill="url(#${prefix}Pad)" stroke="#0758D7" stroke-width="14" stroke-linejoin="round" />
    <rect x="330" y="350" width="46" height="136" rx="14" fill="#FFFFFF" />
    <rect x="285" y="395" width="136" height="46" rx="14" fill="#FFFFFF" />
    <circle cx="621" cy="357" r="30" fill="#FFFFFF" />
    <circle cx="674" cy="410" r="30" fill="#FFFFFF" />
    <circle cx="621" cy="463" r="30" fill="#FFFFFF" />
    <circle cx="568" cy="410" r="30" fill="#FFFFFF" />
  </g>`;

const buildAppIconSvg = ({ width = 1024, height = 1024 } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>${iconDefs('app')}</defs>
  ${vectorIcon('app')}
</svg>
`;

const buildRootIconSvg = () => buildAppIconSvg({ width: 2048, height: 2048 });

const buildHorizontalLogoSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="320" viewBox="0 0 1200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${iconDefs('horizontal')}
    <linearGradient id="lingoWordmark" x1="340" y1="86" x2="760" y2="232" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#075ED7" />
      <stop offset="0.52" stop-color="#0098FF" />
      <stop offset="1" stop-color="#55D7FF" />
    </linearGradient>
  </defs>

  <g transform="translate(36 20) scale(0.273)">
    ${vectorIcon('horizontal')}
  </g>

  <text
    x="318"
    y="204"
    fill="url(#lingoWordmark)"
    font-size="118"
    font-family="${BRAND_FONT_STACK}"
    font-weight="700"
    letter-spacing="0"
  >
    Lingo
  </text>
</svg>
`;

const buildBadgeSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="320" height="96" viewBox="0 0 320 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${iconDefs('badge')}
    <linearGradient id="badgeBg" x1="20" y1="8" x2="298" y2="104" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8FBFF" />
      <stop offset="1" stop-color="#E5F7FF" />
    </linearGradient>
    <linearGradient id="badgeWordmark" x1="102" y1="28" x2="220" y2="68" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#075ED7" />
      <stop offset="0.52" stop-color="#0098FF" />
      <stop offset="1" stop-color="#55D7FF" />
    </linearGradient>
  </defs>

  <rect x="4" y="4" width="312" height="88" rx="44" fill="url(#badgeBg)" stroke="#129CFF" stroke-opacity="0.34" stroke-width="2" />
  <g transform="translate(16 12) scale(0.071)">
    ${vectorIcon('badge')}
  </g>

  <text
    x="104"
    y="58"
    fill="url(#badgeWordmark)"
    font-size="36"
    font-family="${BRAND_FONT_STACK}"
    font-weight="700"
    letter-spacing="0"
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
  writeTextFile(rootIconSvgPath, buildRootIconSvg());

  run('npx', ['tauri', 'icon', sourcePng, '-o', tauriIconsDir]);
  run('npx', ['tauri', 'icon', sourcePng, '-o', tempDir, '-p', '1024', '-p', '256']);

  copyFileSync(join(tempDir, '1024x1024.png'), appIconRoot);
  copyFileSync(join(tempDir, '256x256.png'), appIconSrc);
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
