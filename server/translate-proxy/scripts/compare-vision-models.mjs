import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

const parseNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const resolveMaybePath = (value) => path.resolve(process.cwd(), String(value || '').trim());

const MODEL_PRESETS = Object.freeze({
  'siliconflow-default': [
    'deepseek-ai/DeepSeek-OCR',
    'PaddlePaddle/PaddleOCR-VL-1.5',
    'PaddlePaddle/PaddleOCR-VL',
    'Qwen/Qwen3-VL-8B-Instruct',
  ],
  'siliconflow-dota2': [
    'deepseek-ai/DeepSeek-OCR',
    'PaddlePaddle/PaddleOCR-VL-1.5',
    'PaddlePaddle/PaddleOCR-VL',
    'Qwen/Qwen3-VL-8B-Instruct',
  ],
});

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

const adminToken = String(
  getArgValue('--admin-token') ||
    process.env.LINGO_BACKEND_ADMIN_TOKEN ||
    process.env.TRANSLATE_PROXY_ADMIN_TOKEN ||
    process.env.ADMIN_TOKEN ||
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
const presetName = String(getArgValue('--preset')).trim().toLowerCase();
const models = unique(
  String(getArgValue('--models', ''))
    .split(',')
    .map((item) => item.trim()),
);
const outputMdPath = String(getArgValue('--output-md')).trim();
const outputJsonPath = String(getArgValue('--output-json')).trim();
const expectedPath = String(getArgValue('--expected')).trim();
const overrideVisionProvider = String(getArgValue('--vision-provider')).trim();
const overrideVisionApiUrl = String(getArgValue('--vision-api-url')).trim();
const overrideVisionApiKeyEnvName = String(getArgValue('--vision-api-key-env-name')).trim();
const overrideVisionTimeoutMs = parseNumber(getArgValue('--vision-timeout-ms'));

if (!imageArg && imageArgs.length === 0 && !imageDirArg) {
  console.error(
    [
      'Usage: npm run proxy:vision-compare --',
      '--dir=./samples/dota2-chat',
      '[--image=./one.png]',
      '[--preset=siliconflow-dota2]',
      '--models=deepseek-ai/DeepSeek-OCR,Qwen/Qwen3-VL-8B-Instruct',
      '[--game-scene=dota2]',
      '[--target-language=zh]',
      '[--expected=./samples/dota2-chat/thread-2026-04-02-golden.json]',
      '[--output-md=./reports/vision-compare.md]',
    ].join(' '),
  );
  process.exit(1);
}

const resolveImagePaths = async () => {
  const explicitImages = unique([imageArg, ...imageArgs].filter(Boolean)).map(resolveMaybePath);

  if (!imageDirArg) {
    return explicitImages;
  }

  const imageDir = resolveMaybePath(imageDirArg);
  const entries = await readdir(imageDir, { withFileTypes: true });
  const dirImages = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(imageDir, entry.name))
    .filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  return unique([...explicitImages, ...dirImages]);
};

const buildHeaders = (token = '') => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers.apikey = token;
  }

  return headers;
};

const requestJson = async ({ pathname, method = 'GET', token = '', payload = null }) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: buildHeaders(token),
    body: payload == null ? undefined : JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed: HTTP ${response.status} ${json.message || ''}`.trim());
  }
  return json;
};

const toVisionLanePayload = (summary, modelName) => {
  const lane = summary?.vision_lane || {};
  const nextModelName = String(modelName || lane.model || '').trim();
  return {
    enabled: Boolean(nextModelName),
    provider: overrideVisionProvider || lane.provider || summary?.provider || 'openai-compatible',
    api_url: overrideVisionApiUrl || lane.api_url || summary?.api_url || '',
    model_name: nextModelName,
    api_key_env_name:
      overrideVisionApiKeyEnvName ||
      lane.api_key_env_name ||
      summary?.api_key_env_name ||
      'MODEL_API_KEY',
    timeout_ms: overrideVisionTimeoutMs ?? lane.timeout_ms ?? summary?.timeout_ms ?? 8_000,
  };
};

const restoreVisionLanePayload = (summary) => {
  const lane = summary?.vision_lane || {};
  return {
    enabled: lane.enabled === true,
    provider: lane.provider || summary?.provider || 'openai-compatible',
    api_url: lane.api_url || summary?.api_url || '',
    model_name: String(lane.model || '').trim(),
    api_key_env_name:
      lane.api_key_env_name || summary?.api_key_env_name || 'MODEL_API_KEY',
    timeout_ms: lane.timeout_ms ?? summary?.timeout_ms ?? 8_000,
  };
};

const measure = async (fn) => {
  const startedAt = Date.now();
  const value = await fn();
  return {
    value,
    durationMs: Date.now() - startedAt,
  };
};

const average = (values) => {
  const valid = values.filter((item) => Number.isFinite(item));
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
};

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return null;
  }
  const base = 10 ** digits;
  return Math.round(value * base) / base;
};

const escapeMarkdown = (value) =>
  String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');

const normalizeLooseText = (value) =>
  String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeChannel = (value) =>
  normalizeLooseText(value)
    .replace(/^\[+/, '')
    .replace(/\]+$/, '')
    .trim();

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null || value === '') {
    return [];
  }
  return [value];
};

const buildTranslationCandidates = (line) =>
  unique(
    [
      ...toArray(line?.expected_translation_zh),
      ...toArray(line?.expected_translation_zh_alternatives),
      ...toArray(line?.expected_translation_zh_candidates),
    ].map((item) => String(item || '').trim()),
  );

const normalizeExpectedLine = (line, index) => ({
  index,
  speaker: String(line?.speaker || '').trim(),
  channel: String(line?.channel || '').trim(),
  text: String(line?.text || '').trim(),
  is_system: line?.is_system === true,
  skip_translate: line?.skip_translate === true,
  expected_translation_candidates: buildTranslationCandidates(line),
});

const loadExpectedSet = async (filePath) => {
  if (!filePath) {
    return null;
  }

  const resolvedPath = resolveMaybePath(filePath);
  const raw = await readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed?.items)
    ? parsed.items.map((item, index) => ({
        id: String(item?.id || `expected-${index + 1}`),
        suggested_filename: String(item?.suggested_filename || '').trim(),
        notes: String(item?.notes || '').trim(),
        expected_lines: Array.isArray(item?.expected_lines)
          ? item.expected_lines.map((line, lineIndex) => normalizeExpectedLine(line, lineIndex))
          : [],
      }))
    : [];

  return {
    path: resolvedPath,
    metadata: parsed?.metadata || {},
    items,
  };
};

const findExpectedItem = (expectedSet, imagePath, imageIndex) => {
  if (!expectedSet || !Array.isArray(expectedSet.items) || expectedSet.items.length === 0) {
    return null;
  }

  const imageName = path.basename(imagePath);
  return (
    expectedSet.items.find((item) => item.suggested_filename === imageName) ||
    expectedSet.items[imageIndex] ||
    null
  );
};

const compareAgainstExpected = (imageResult, expectedItem) => {
  if (!expectedItem) {
    return null;
  }

  const recognizedLines = imageResult.lines.filter((line) => !line?.is_system);
  const expectedLines = expectedItem.expected_lines.filter((line) => !line?.is_system);
  const expectedTranslatedLines = expectedLines.filter((line) => !line.skip_translate);
  const translationResults = imageResult.translations || [];

  let textMatches = 0;
  let speakerMatches = 0;
  let channelMatches = 0;
  let translationMatches = 0;

  for (let index = 0; index < expectedLines.length; index += 1) {
    const expectedLine = expectedLines[index];
    const recognizedLine = recognizedLines[index];
    if (!recognizedLine) {
      continue;
    }

    if (normalizeLooseText(recognizedLine.text) === normalizeLooseText(expectedLine.text)) {
      textMatches += 1;
    }
    if (normalizeLooseText(recognizedLine.speaker) === normalizeLooseText(expectedLine.speaker)) {
      speakerMatches += 1;
    }
    if (normalizeChannel(recognizedLine.channel) === normalizeChannel(expectedLine.channel)) {
      channelMatches += 1;
    }
  }

  for (let index = 0; index < expectedTranslatedLines.length; index += 1) {
    const expectedLine = expectedTranslatedLines[index];
    const translation = translationResults[index];
    if (!translation) {
      continue;
    }
    const normalizedActual = normalizeLooseText(translation.translated_text);
    const matched = expectedLine.expected_translation_candidates.some(
      (candidate) => normalizeLooseText(candidate) === normalizedActual,
    );
    if (matched) {
      translationMatches += 1;
    }
  }

  const toRate = (matched, total) => (total > 0 ? round(matched / total, 4) : null);

  return {
    expected_id: expectedItem.id,
    expected_filename: expectedItem.suggested_filename || null,
    expected_notes: expectedItem.notes || null,
    expected_non_system_lines: expectedLines.length,
    expected_translated_lines: expectedTranslatedLines.length,
    text_matches: textMatches,
    speaker_matches: speakerMatches,
    channel_matches: channelMatches,
    translation_matches: translationMatches,
    text_match_rate: toRate(textMatches, expectedLines.length),
    speaker_match_rate: toRate(speakerMatches, expectedLines.length),
    channel_match_rate: toRate(channelMatches, expectedLines.length),
    translation_match_rate: toRate(translationMatches, expectedTranslatedLines.length),
  };
};

const fetchCurrentConfigs = async () => {
  const publicConfig = await requestJson({
    pathname: '/public/client-config',
  });

  const adminConfig = adminToken
    ? await requestJson({
        pathname: '/admin/runtime-config',
        token: adminToken,
      })
    : null;

  return {
    publicConfig,
    adminConfig,
  };
};

const updateVisionLane = async (visionLanePayload) =>
  requestJson({
    pathname: '/admin/runtime-config',
    method: 'PUT',
    token: adminToken,
    payload: {
      vision_lane: visionLanePayload,
    },
  });

const translateLine = async (text) =>
  requestJson({
    pathname: '/translate',
    method: 'POST',
    token: publicKey,
    payload: {
      text,
      translation_from: 'auto',
      translation_to: targetLanguage,
      translation_mode: 'auto',
      game_scene: gameScene,
      daily_mode: false,
      usage: 'inbound_read',
    },
  });

const runImageEvaluation = async (imagePath, expectedItem = null) => {
  const image = await readFile(imagePath);
  const imageBase64 = image.toString('base64');
  const visionRun = await measure(() =>
    requestJson({
      pathname: '/vision/chat-lines',
      method: 'POST',
      token: publicKey,
      payload: {
        image_base64: imageBase64,
        game_scene: gameScene,
        ui_locale: uiLocale,
      },
    }),
  );

  const lines = Array.isArray(visionRun.value?.lines) ? visionRun.value.lines : [];
  const translations = [];

  for (const line of lines) {
    if (!shouldTranslate || !line?.text || line?.is_system) {
      continue;
    }

    const translatedRun = await measure(() => translateLine(String(line.text)));
    translations.push({
      source_text: String(line.text || ''),
      translated_text: translatedRun.value?.translated_text || '',
      model: translatedRun.value?.model || null,
      prompt_variant: translatedRun.value?.prompt_variant || null,
      effective_temperature: translatedRun.value?.effective_temperature ?? null,
      model_route: translatedRun.value?.model_route || null,
      trace_id: translatedRun.value?.trace_id || null,
      duration_ms: translatedRun.durationMs,
    });
  }

  const confidences = lines
    .map((line) => Number(line?.confidence))
    .filter((value) => Number.isFinite(value));
  const nonSystemCount = lines.filter((line) => !line?.is_system).length;
  const translationDurations = translations
    .map((item) => Number(item.duration_ms))
    .filter((value) => Number.isFinite(value));

  const result = {
    image_path: imagePath,
    vision_ms: visionRun.durationMs,
    recognized_lines: lines.length,
    non_system_lines: nonSystemCount,
    avg_confidence: round(average(confidences), 4),
    translate_total_ms: translationDurations.reduce((sum, value) => sum + value, 0),
    translate_avg_ms: round(average(translationDurations), 2),
    lines: lines.map((line, index) => ({
      index,
      speaker: line?.speaker || '',
      channel: line?.channel || '',
      text: line?.text || '',
      is_system: Boolean(line?.is_system),
      confidence: line?.confidence ?? null,
      order: line?.order ?? index,
    })),
    translations,
  };

  result.expected = compareAgainstExpected(result, expectedItem);
  return result;
};

const summarizeModelRun = (modelName, imageResults) => {
  const visionDurations = imageResults
    .map((item) => Number(item.vision_ms))
    .filter((value) => Number.isFinite(value));
  const translationDurations = imageResults
    .map((item) => Number(item.translate_avg_ms))
    .filter((value) => Number.isFinite(value));
  const confidences = imageResults
    .map((item) => Number(item.avg_confidence))
    .filter((value) => Number.isFinite(value));
  const textMatchRates = imageResults
    .map((item) => Number(item.expected?.text_match_rate))
    .filter((value) => Number.isFinite(value));
  const translationMatchRates = imageResults
    .map((item) => Number(item.expected?.translation_match_rate))
    .filter((value) => Number.isFinite(value));
  const speakerMatchRates = imageResults
    .map((item) => Number(item.expected?.speaker_match_rate))
    .filter((value) => Number.isFinite(value));

  return {
    model: modelName,
    images: imageResults.length,
    recognized_lines: imageResults.reduce((sum, item) => sum + Number(item.recognized_lines || 0), 0),
    non_system_lines: imageResults.reduce((sum, item) => sum + Number(item.non_system_lines || 0), 0),
    avg_vision_ms: round(average(visionDurations), 2),
    avg_translate_ms: round(average(translationDurations), 2),
    avg_confidence: round(average(confidences), 4),
    avg_text_match_rate: round(average(textMatchRates), 4),
    avg_translation_match_rate: round(average(translationMatchRates), 4),
    avg_speaker_match_rate: round(average(speakerMatchRates), 4),
  };
};

const renderMarkdownReport = ({ metadata, modelResults, expectedSet }) => {
  const lines = [
    '# Vision Compare Report',
    '',
    `- Base URL: \`${metadata.baseUrl}\``,
    `- Game Scene: \`${metadata.gameScene}\``,
    `- UI Locale: \`${metadata.uiLocale}\``,
    `- Target Language: \`${metadata.targetLanguage}\``,
    `- Translate: \`${metadata.translate}\``,
    `- Images: \`${metadata.imageCount}\``,
    `- Preset: \`${metadata.preset || ''}\``,
    `- Expected Set: \`${expectedSet?.path || ''}\``,
    '',
    '| Model | Images | Recognized Lines | Non-System Lines | Avg Confidence | Avg Vision ms | Avg Translate ms | Avg Text Match | Avg Translation Match | Avg Speaker Match |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const modelResult of modelResults) {
    lines.push(
      `| ${escapeMarkdown(modelResult.summary.model)} | ${modelResult.summary.images} | ${modelResult.summary.recognized_lines} | ${modelResult.summary.non_system_lines} | ${modelResult.summary.avg_confidence ?? ''} | ${modelResult.summary.avg_vision_ms ?? ''} | ${modelResult.summary.avg_translate_ms ?? ''} | ${modelResult.summary.avg_text_match_rate ?? ''} | ${modelResult.summary.avg_translation_match_rate ?? ''} | ${modelResult.summary.avg_speaker_match_rate ?? ''} |`,
    );
  }

  for (const modelResult of modelResults) {
    lines.push('', `## ${modelResult.summary.model}`, '');
    for (const imageResult of modelResult.images) {
      lines.push(
        `### ${escapeMarkdown(path.basename(imageResult.image_path))}`,
        '',
        `- Vision ms: \`${imageResult.vision_ms}\``,
        `- Recognized lines: \`${imageResult.recognized_lines}\``,
        `- Non-system lines: \`${imageResult.non_system_lines}\``,
        `- Avg confidence: \`${imageResult.avg_confidence ?? ''}\``,
      );

      if (imageResult.expected) {
        lines.push(
          `- Expected sample: \`${imageResult.expected.expected_id}\``,
          `- Text match: \`${imageResult.expected.text_matches}/${imageResult.expected.expected_non_system_lines}\``,
          `- Translation match: \`${imageResult.expected.translation_matches}/${imageResult.expected.expected_translated_lines}\``,
          `- Speaker match: \`${imageResult.expected.speaker_matches}/${imageResult.expected.expected_non_system_lines}\``,
        );
      }

      if (imageResult.lines.length > 0) {
        lines.push('', '| Speaker | Channel | Text | Confidence |', '| --- | --- | --- | ---: |');
        for (const line of imageResult.lines) {
          lines.push(
            `| ${escapeMarkdown(line.speaker)} | ${escapeMarkdown(line.channel)} | ${escapeMarkdown(line.text)} | ${line.confidence ?? ''} |`,
          );
        }
      }

      if (imageResult.translations.length > 0) {
        lines.push('', '| Source | Translation | Model Route | Prompt Variant | ms |', '| --- | --- | --- | --- | ---: |');
        for (const translation of imageResult.translations) {
          lines.push(
            `| ${escapeMarkdown(translation.source_text)} | ${escapeMarkdown(translation.translated_text)} | ${escapeMarkdown(translation.model_route)} | ${escapeMarkdown(translation.prompt_variant)} | ${translation.duration_ms} |`,
          );
        }
      }

      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
};

try {
  const imagePaths = await resolveImagePaths();
  if (imagePaths.length === 0) {
    throw new Error('No image files found for evaluation');
  }

  const expectedSet = await loadExpectedSet(expectedPath);

  if (presetName && !MODEL_PRESETS[presetName]) {
    throw new Error(
      `Unknown preset "${presetName}". Available presets: ${Object.keys(MODEL_PRESETS).join(', ')}`,
    );
  }

  const { publicConfig, adminConfig } = await fetchCurrentConfigs();
  const currentModel = String(
    adminConfig?.vision_lane?.model || publicConfig?.vision_lane?.model || '',
  ).trim();
  const presetModels = MODEL_PRESETS[presetName] || [];
  const evaluationModels =
    models.length > 0 ? models : presetModels.length > 0 ? presetModels : currentModel ? [currentModel] : [];

  if (evaluationModels.length === 0) {
    throw new Error('No models provided and current vision_lane model is empty');
  }

  const needsAdminMutation =
    evaluationModels.length > 1 ||
    (evaluationModels.length === 1 && evaluationModels[0] !== currentModel);

  if (needsAdminMutation && !adminToken) {
    throw new Error('Comparing or switching models requires --admin-token or ADMIN_TOKEN');
  }

  console.log(
    [
      '[vision-compare]',
      `base_url=${baseUrl}`,
      `game_scene=${gameScene}`,
      `ui_locale=${uiLocale}`,
      `target_language=${targetLanguage}`,
      `translate=${shouldTranslate}`,
      `images=${imagePaths.length}`,
      `preset=${presetName || '-'}`,
      `models=${evaluationModels.join(',')}`,
    ].join(' '),
  );

  const originalAdminConfig = adminConfig;
  const modelResults = [];

  try {
    for (const modelName of evaluationModels) {
      if (needsAdminMutation) {
        console.log(`[vision-compare] switching vision model -> ${modelName}`);
        await updateVisionLane(toVisionLanePayload(originalAdminConfig, modelName));
      }

      const imageResults = [];
      for (const imagePath of imagePaths) {
        console.log(`[vision-compare] model=${modelName} image=${imagePath}`);
        const expectedItem = findExpectedItem(expectedSet, imagePath, imageResults.length);
        imageResults.push(await runImageEvaluation(imagePath, expectedItem));
      }

      modelResults.push({
        summary: summarizeModelRun(modelName, imageResults),
        images: imageResults,
      });
    }
  } finally {
    if (needsAdminMutation && originalAdminConfig) {
      console.log('[vision-compare] restoring original vision_lane');
      await updateVisionLane(restoreVisionLanePayload(originalAdminConfig));
    }
  }

  const report = {
    metadata: {
      baseUrl,
      gameScene,
      uiLocale,
      targetLanguage,
      translate: shouldTranslate,
      imageCount: imagePaths.length,
      preset: presetName || null,
      generatedAt: new Date().toISOString(),
      models: evaluationModels,
    },
    currentVisionModel: currentModel || null,
    expectedSet: expectedSet
      ? {
          path: expectedSet.path,
          metadata: expectedSet.metadata,
        }
      : null,
    modelResults,
  };

  const markdown = renderMarkdownReport({
    metadata: report.metadata,
    modelResults,
    expectedSet,
  });

  if (outputJsonPath) {
    const resolvedOutputJsonPath = resolveMaybePath(outputJsonPath);
    await mkdir(path.dirname(resolvedOutputJsonPath), { recursive: true });
    await writeFile(resolvedOutputJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[vision-compare] wrote json -> ${resolvedOutputJsonPath}`);
  }

  if (outputMdPath) {
    const resolvedOutputMdPath = resolveMaybePath(outputMdPath);
    await mkdir(path.dirname(resolvedOutputMdPath), { recursive: true });
    await writeFile(resolvedOutputMdPath, markdown, 'utf8');
    console.log(`[vision-compare] wrote markdown -> ${resolvedOutputMdPath}`);
  }

  console.log(markdown);
} catch (error) {
  console.error('[vision-compare] failed:', error?.message || error);
  process.exitCode = 1;
}
