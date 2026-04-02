import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

const getArgValue = (prefix, fallback = '') => {
  const matched = args.find((item) => item.startsWith(`${prefix}=`));
  return matched ? matched.slice(prefix.length + 1) : fallback;
};

const parseBoolean = (value, fallback = false) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const baseUrl = String(
  getArgValue('--url') ||
    process.env.LINGO_BACKEND_URL ||
    process.env.TRANSLATE_PROXY_URL ||
    'http://127.0.0.1:8787',
).replace(/\/+$/, '');

const publicKey = String(
  getArgValue('--token') ||
    process.env.LINGO_BACKEND_ANON_KEY ||
    process.env.BACKEND_PUBLIC_KEY ||
    process.env.TRANSLATE_PROXY_PUBLIC_KEY ||
    '',
).trim();

const imageArgs = args
  .filter((item) => item.startsWith('--image='))
  .map((item) => item.slice('--image='.length))
  .map((item) => String(item || '').trim())
  .filter(Boolean);
const imageArg = String(getArgValue('--image')).trim();
const imageDirArg = String(getArgValue('--dir')).trim();
const gameScene = String(getArgValue('--game-scene', 'dota2')).trim() || 'dota2';
const uiLocale = String(getArgValue('--ui-locale', 'zh-CN')).trim() || 'zh-CN';
const targetLanguage = String(getArgValue('--target-language', 'zh')).trim() || 'zh';
const shouldTranslate = parseBoolean(getArgValue('--translate', 'true'), true);

if (!imageArg && imageArgs.length === 0 && !imageDirArg) {
  console.error(
    'Usage: npm run proxy:vision-smoke -- --image=./sample.png [--image=./sample2.png] [--dir=./samples] [--game-scene=dota2] [--translate=true] [--target-language=zh]',
  );
  process.exit(1);
}

const resolveImagePaths = async () => {
  const explicitImages = [...new Set([imageArg, ...imageArgs].filter(Boolean))]
    .map((item) => path.resolve(process.cwd(), item));

  if (!imageDirArg) {
    return explicitImages;
  }

  const imageDir = path.resolve(process.cwd(), imageDirArg);
  const entries = await readdir(imageDir, { withFileTypes: true });
  const dirImages = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(imageDir, entry.name))
    .filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  return [...new Set([...explicitImages, ...dirImages])];
};

const buildHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (publicKey) {
    headers.Authorization = `Bearer ${publicKey}`;
    headers.apikey = publicKey;
  }

  return headers;
};

const requestJson = async (pathname, payload) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed: HTTP ${response.status} ${json.message || ''}`.trim());
  }
  return json;
};

const translateLine = async (text) =>
  requestJson('/translate', {
    text,
    translation_from: 'auto',
    translation_to: targetLanguage,
    translation_mode: 'auto',
    game_scene: gameScene,
    daily_mode: false,
    usage: 'inbound_read',
  });

try {
  const imagePaths = await resolveImagePaths();
  console.log(
    [
      '[vision-smoke]',
      `base_url=${baseUrl}`,
      `game_scene=${gameScene}`,
      `ui_locale=${uiLocale}`,
      `target_language=${targetLanguage}`,
      `translate=${shouldTranslate}`,
      `images=${imagePaths.length}`,
    ].join(' '),
  );

  for (const imagePath of imagePaths) {
    const image = await readFile(imagePath);
    const imageBase64 = image.toString('base64');

    console.log(`[vision-smoke] image=${imagePath}`);

    const visionResult = await requestJson('/vision/chat-lines', {
      image_base64: imageBase64,
      game_scene: gameScene,
      ui_locale: uiLocale,
    });

    const lines = Array.isArray(visionResult.lines) ? visionResult.lines : [];
    console.log(`[vision-smoke] recognized_lines=${lines.length}`);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      console.log(
        JSON.stringify(
          {
            image: imagePath,
            index,
            speaker: line.speaker || '',
            channel: line.channel || '',
            text: line.text || '',
            is_system: Boolean(line.is_system),
            confidence: line.confidence ?? null,
            order: line.order ?? index,
          },
          null,
          2,
        ),
      );

      if (shouldTranslate && line?.text && !line?.is_system) {
        const translated = await translateLine(String(line.text));
        console.log(
          JSON.stringify(
            {
              image: imagePath,
              index,
              translated_text: translated.translated_text || '',
              model: translated.model || null,
              prompt_variant: translated.prompt_variant || null,
              effective_temperature: translated.effective_temperature ?? null,
              trace_id: translated.trace_id || null,
            },
            null,
            2,
          ),
        );
      }
    }
  }
} catch (error) {
  console.error('[vision-smoke] failed:', error?.message || error);
  process.exitCode = 1;
}
