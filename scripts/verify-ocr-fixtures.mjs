import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtureDirectory = resolve('spikes/ocr-vision/samples/dota2');
const groundTruthPath = join(fixtureDirectory, 'groundtruth.tsv');
const fixtures = [
  {
    filename: '纯中文短句-推中路.png',
    crop: [200, 1280, 1700, 120],
    productionExpected: '推中路',
  },
  {
    filename: '纯中文长句.png',
    crop: [200, 1280, 2000, 120],
    productionExpected: '等我大招出来再开团，对面火枪没买活',
  },
  {
    filename: '纯英文短句.png',
    crop: [200, 1280, 1700, 120],
    productionExpected: 'gg wp',
  },
  {
    filename: '纯英文长句.png',
    crop: [200, 1300, 2000, 120],
    productionExpected: 'smoke up rosh after their bkb',
  },
  {
    filename: '纯俄文任意长度.png',
    crop: [200, 1280, 1700, 120],
    productionExpected: 'иди в лес я фармлю',
  },
  {
    filename: '中英文混排.png',
    crop: [200, 1300, 1700, 120],
    productionExpected: 'gank mid 五人抱团',
  },
  {
    filename: '全局黄色 ID.png',
    crop: [200, 1200, 1500, 400],
    productionExpected: 'Gabriel正在防守下路',
  },
  { filename: '复杂 ID.png', crop: [80, 1340, 1850, 90], productionExpectEmpty: true },
  {
    filename: '团战画面.png',
    crop: [200, 1300, 1500, 200],
    expectEmpty: true,
    productionExpectEmpty: true,
  },
  {
    filename: '空旷画面.png',
    crop: [200, 1300, 1500, 200],
    expectEmpty: true,
    productionExpectEmpty: true,
  },
];

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    fail(`${command} exited with ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
};

const normalize = (text) => text
  .normalize('NFKC')
  .toLocaleLowerCase('und')
  .replace(/\s+/gu, '');

const parseGroundTruth = () => {
  const rows = readFileSync(groundTruthPath, 'utf8')
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.split('\t'));
  const header = rows.shift();
  if (header?.join('\t') !== 'filename\tsender\texpected-message') {
    fail(`Unexpected ground-truth header in ${groundTruthPath}`);
  }

  const byFilename = new Map();
  for (const [filename, sender, expectedMessage, ...extra] of rows) {
    if (!filename || !sender || !expectedMessage || extra.length > 0) {
      fail(`Invalid ground-truth row: ${[filename, sender, expectedMessage, ...extra].join('\t')}`);
    }
    const entries = byFilename.get(filename) ?? [];
    entries.push({ sender, expectedMessage });
    byFilename.set(filename, entries);
  }
  return byFilename;
};

if (!['darwin', 'win32'].includes(process.platform)) {
  fail('OCR fixture verification requires a supported native OCR platform (macOS or Windows).');
}

run('ffmpeg', ['-version']);
run('ffprobe', ['-version']);
run(
  'cargo',
  ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--quiet', '--example', 'ocr_fixture'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

const executable = resolve(
  'src-tauri/target/debug/examples',
  process.platform === 'win32' ? 'ocr_fixture.exe' : 'ocr_fixture',
);
const groundTruth = parseGroundTruth();
const knownFixtures = new Set(fixtures.map(({ filename }) => filename));
for (const filename of groundTruth.keys()) {
  if (!knownFixtures.has(filename)) {
    fail(`Ground truth has no crop specification: ${filename}`);
  }
}
for (const fixture of fixtures) {
  const hasExpectedMessage = typeof fixture.productionExpected === 'string';
  if (hasExpectedMessage === Boolean(fixture.productionExpectEmpty)) {
    fail(`${fixture.filename}: declare exactly one production-profile expectation`);
  }
}

const tempDirectory = mkdtempSync(join(tmpdir(), 'lingo-ocr-fixtures-'));
let handCropAssertions = 0;
let productionAssertions = 0;

const readImageDimensions = (inputPath) => {
  const report = JSON.parse(run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    inputPath,
  ]));
  const { width, height } = report.streams?.[0] ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    fail(`${inputPath}: could not read image dimensions`);
  }
  return { width, height };
};

const recognizeCrop = (inputPath, crop, frameName) => {
  const { x, y, w: width, h: height } = crop;
  const framePath = join(tempDirectory, `${frameName}.bgra`);
  run('ffmpeg', [
    '-nostdin',
    '-v', 'error',
    '-y',
    '-i', inputPath,
    '-vf', `crop=${width}:${height}:${x}:${y}`,
    '-pix_fmt', 'bgra',
    '-f', 'rawvideo',
    framePath,
  ]);
  return JSON.parse(run(executable, [framePath, String(width), String(height)]));
};

try {
  for (const [index, fixture] of fixtures.entries()) {
    const [x, y, width, height] = fixture.crop;
    const inputPath = join(fixtureDirectory, fixture.filename);
    const frameName = `${index}-${basename(fixture.filename, '.png')}`;
    const report = recognizeCrop(inputPath, { x, y, w: width, h: height }, `${frameName}-hand`);
    const lines = report.lines ?? [];
    const messages = report.messages ?? [];

    if (fixture.expectEmpty) {
      if (lines.length !== 0 || messages.length !== 0) {
        fail(`${fixture.filename}: expected no chat, received ${lines.length} OCR line(s) and ${messages.length} message(s)`);
      }
      handCropAssertions += 1;
      console.log(`PASS ${fixture.filename}: no chat detected`);
    } else {
      const expectedEntries = groundTruth.get(fixture.filename);
      if (!expectedEntries?.length) {
        fail(`${fixture.filename}: missing ground truth`);
      }

      for (const { sender, expectedMessage } of expectedEntries) {
        const expected = normalize(expectedMessage);
        const matchingLines = lines.filter(({ text }) => normalize(text).includes(expected));
        if (matchingLines.length !== 1) {
          fail(`${fixture.filename}: expected exactly one OCR line containing "${expectedMessage}", received ${matchingLines.length}`);
        }

        if (sender !== 'system') {
          const foundMessage = messages.some(({ text }) => normalize(text).includes(expected));
          if (!foundMessage) {
            fail(`${fixture.filename}: tracker did not emit "${expectedMessage}"`);
          }
        }
        handCropAssertions += 1;
      }

      console.log(`PASS ${fixture.filename}: ${expectedEntries.length} expected message(s)`);
    }

    const dimensions = readImageDimensions(inputPath);
    const profileReport = JSON.parse(run(executable, [
      'profile',
      'dota2',
      String(dimensions.width),
      String(dimensions.height),
    ]));
    const productionReport = recognizeCrop(
      inputPath,
      profileReport.rect,
      `${frameName}-production`,
    );
    const productionMessages = productionReport.messages ?? [];

    if (fixture.productionExpected) {
      const expected = normalize(fixture.productionExpected);
      const matchingMessages = productionMessages.filter(({ text }) =>
        normalize(text).includes(expected),
      );
      if (matchingMessages.length !== 1 || productionMessages.length !== 1) {
        fail(
          `${fixture.filename}: production profile expected only "${fixture.productionExpected}", received ${JSON.stringify(productionMessages)}`,
        );
      }
    } else if (productionMessages.length !== 0) {
      fail(
        `${fixture.filename}: production profile emitted non-chat text ${JSON.stringify(productionMessages)}`,
      );
    }
    productionAssertions += 1;
    console.log(`PASS ${fixture.filename}: production profile filtered correctly`);
  }
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log(
  `OCR fixtures verified: ${fixtures.length} screenshots, ${handCropAssertions} hand-crop assertions, ${productionAssertions} production-profile assertions.`,
);
