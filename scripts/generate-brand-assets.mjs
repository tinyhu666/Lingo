import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourceSvg = join(repoRoot, 'icon.svg');
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

const APP_ICON_VIEWBOX = '140 260 744 500';
const BRAND_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif';
const sourceSvgMarkup = readFileSync(sourceSvg, 'utf8');
const iconInnerMarkup = sourceSvgMarkup.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
};

if (!existsSync(sourceSvg)) {
  throw new Error(`Missing brand source SVG: ${sourceSvg}`);
}

const ensureParentDir = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const writeTextFile = (filePath, content) => {
  ensureParentDir(filePath);
  writeFileSync(filePath, content);
};

const rasterizeSvg = (inputPath, outputPath) => {
  ensureParentDir(outputPath);
  run('sips', ['-s', 'format', 'png', inputPath, '--out', outputPath], { stdio: 'pipe' });
};

const brandIcon = ({ x, y, width, height }) => `
  <svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${APP_ICON_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${iconInnerMarkup}
  </svg>`;

const buildAppIconSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${brandIcon({ x: 64, y: 217, width: 896, height: 590 })}
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

  ${brandIcon({ x: 20, y: 42, width: 264, height: 236 })}

  <text
    x="324"
    y="192"
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
  ${brandIcon({ x: 12, y: 16, width: 74, height: 64 })}

  <text
    x="96"
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

const buildOgImageSvg = (appIconDataUri) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#08101D" />
      <stop offset="0.52" stop-color="#0D1730" />
      <stop offset="1" stop-color="#121636" />
    </linearGradient>
    <radialGradient id="ogGlowLeft" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(202 184) rotate(16.1) scale(290 194)">
      <stop stop-color="#22D3EE" stop-opacity="0.22" />
      <stop offset="1" stop-color="#22D3EE" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="ogGlowRight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(972 448) rotate(-162.5) scale(326 244)">
      <stop stop-color="#8B5CF6" stop-opacity="0.22" />
      <stop offset="1" stop-color="#8B5CF6" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="ogHeadline" x1="84" y1="208" x2="546" y2="418" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" />
      <stop offset="1" stop-color="#C7D7FF" />
    </linearGradient>
    <linearGradient id="ogWordmark" x1="174" y1="66" x2="280" y2="108" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" />
      <stop offset="1" stop-color="#BFD2FF" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#ogBg)" />
  <rect x="28" y="28" width="1144" height="574" rx="40" stroke="#BED2FF" stroke-opacity="0.12" />
  <circle cx="200" cy="184" r="214" fill="url(#ogGlowLeft)" />
  <circle cx="968" cy="444" r="244" fill="url(#ogGlowRight)" />

  <g opacity="0.94">
    <rect x="84" y="74" width="224" height="56" rx="28" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.12" />
    <image href="${appIconDataUri}" x="98" y="82" width="58" height="58" preserveAspectRatio="xMidYMid meet" />
    <text x="174" y="108" fill="url(#ogWordmark)" font-size="28" font-family="${BRAND_FONT_STACK}" font-weight="650" letter-spacing="-0.8">
      Lingo
    </text>
  </g>

  <text x="84" y="240" fill="#D3E0FF" fill-opacity="0.86" font-size="20" font-family="${BRAND_FONT_STACK}" font-weight="600" letter-spacing="3.6">
    AI IN-GAME CHAT TRANSLATION
  </text>
  <text x="84" y="328" fill="url(#ogHeadline)" font-size="72" font-family="${BRAND_FONT_STACK}" font-weight="700" letter-spacing="-2.8">
    Translate. Game.
  </text>
  <text x="84" y="408" fill="url(#ogHeadline)" font-size="72" font-family="${BRAND_FONT_STACK}" font-weight="700" letter-spacing="-2.8">
    Together.
  </text>
  <text x="84" y="474" fill="#D6DFFF" fill-opacity="0.76" font-size="28" font-family="${BRAND_FONT_STACK}" font-weight="500">
    Hotkey-first chat translation for Windows and macOS.
  </text>

  <g>
    <rect x="702" y="114" width="392" height="392" rx="44" fill="#FFFFFF" fill-opacity="0.04" stroke="#CBD8FF" stroke-opacity="0.14" />
    <rect x="728" y="140" width="340" height="340" rx="34" fill="#0C1327" fill-opacity="0.66" stroke="#FFFFFF" stroke-opacity="0.08" />
    <image href="${appIconDataUri}" x="760" y="164" width="302" height="302" preserveAspectRatio="xMidYMid meet" />
  </g>
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
  redundantTauriOutputs.forEach((targetPath) => {
    rmSync(targetPath, { recursive: true, force: true });
  });

  if (websiteExists) {
    const ogImageSvgPath = join(tempDir, 'og-image.svg');
    const ogIconDataUri = `data:image/png;base64,${readFileSync(join(tempDir, '1024x1024.png')).toString('base64')}`;

    copyFileSync(appIconSvgPath, websiteAppIconSvgPath);
    copyFileSync(horizontalLogoSvgPath, websiteLogoSvgPath);
    copyFileSync(join(tempDir, '1024x1024.png'), websiteAppIconPngPath);
    copyFileSync(join(tauriIconsDir, 'icon.ico'), websiteFaviconIcoPath);

    writeTextFile(ogImageSvgPath, buildOgImageSvg(ogIconDataUri));
    rasterizeSvg(ogImageSvgPath, websiteOgImagePngPath);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
