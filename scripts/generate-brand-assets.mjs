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
const DESKTOP_ICON_SCALE = 1.14;

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
  <linearGradient id="${prefix}Bubble" x1="164" y1="130" x2="850" y2="852" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7EEBFF" />
    <stop offset="0.46" stop-color="#23B5FF" />
    <stop offset="1" stop-color="#0B70DF" />
  </linearGradient>
  <linearGradient id="${prefix}Pad" x1="248" y1="300" x2="740" y2="602" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#F8FDFF" />
    <stop offset="0.55" stop-color="#CFF3FF" />
    <stop offset="1" stop-color="#72D4FF" />
  </linearGradient>
  <linearGradient id="${prefix}Accent" x1="330" y1="348" x2="682" y2="536" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#008DFF" />
    <stop offset="1" stop-color="#075ED7" />
  </linearGradient>`;

const vectorIcon = (prefix = 'lingoIcon') => `
  <g>
    <path d="M130 150h708a130 130 0 0 1 130 130v494a130 130 0 0 1-130 130H496L236 980l92-196A130 130 0 0 1 130 654V280a130 130 0 0 1 130-130Z" fill="url(#${prefix}Bubble)" stroke="#006EDB" stroke-width="30" stroke-linejoin="round" />
    <path d="M176 292a92 92 0 0 1 92-92h488" fill="none" stroke="#BDF7FF" stroke-width="10" stroke-linecap="round" opacity="0.72" />
    <path d="M248 438c18-82 74-116 144-92 22 8 34-22 66-22h108c32 0 44 30 66 22 70-24 126 10 144 92 18 80 4 180-44 230-42 44-108 10-136-44H428c-28 54-94 88-136 44-48-50-62-150-44-230Z" fill="url(#${prefix}Pad)" stroke="#0866D7" stroke-width="18" stroke-linejoin="round" />
    <rect x="324" y="444" width="48" height="144" rx="16" fill="url(#${prefix}Accent)" />
    <rect x="276" y="492" width="144" height="48" rx="16" fill="url(#${prefix}Accent)" />
    <rect x="442" y="430" width="146" height="56" rx="28" fill="#DFF8FF" />
    <rect x="470" y="455" width="90" height="10" rx="5" fill="#0870DD" />
    <circle cx="644" cy="440" r="34" fill="#008DFF" />
    <circle cx="704" cy="500" r="34" fill="#36C5FF" />
    <circle cx="644" cy="560" r="34" fill="#0870DD" />
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

const writeAmplifiedDesktopSourceSvg = (filePath) => {
  const canvasSize = 2048;
  const scaledSize = canvasSize * DESKTOP_ICON_SCALE;
  const offset = (canvasSize - scaledSize) / 2;
  const sourceBase64 = readFileSync(sourcePng).toString('base64');

  writeTextFile(
    filePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,${sourceBase64}" x="${offset}" y="${offset}" width="${scaledSize}" height="${scaledSize}" />
</svg>
`,
  );
};

const tempDir = mkdtempSync(join(tmpdir(), 'lingo-brand-'));

try {
  const desktopSourceSvgPath = join(tempDir, 'desktop-icon-source.svg');

  writeTextFile(appIconSvgPath, buildAppIconSvg());
  writeTextFile(horizontalLogoSvgPath, buildHorizontalLogoSvg());
  writeTextFile(badgeSvgPath, buildBadgeSvg());
  writeTextFile(rootIconSvgPath, buildRootIconSvg());
  writeAmplifiedDesktopSourceSvg(desktopSourceSvgPath);

  run('npx', ['tauri', 'icon', desktopSourceSvgPath, '-o', tauriIconsDir]);
  run('npx', ['tauri', 'icon', desktopSourceSvgPath, '-o', tempDir, '-p', '1024', '-p', '256']);

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
