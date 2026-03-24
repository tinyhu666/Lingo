import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const rawVersion = process.argv[2] || process.env.RELEASE_VERSION || '';
const releaseVersion = String(rawVersion).replace(/^v/i, '').trim();

const changelog = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
const sections = [];
let current = null;

for (const line of changelog.split('\n')) {
  const header = line.match(/^##\s+\[([^\]]+)\]/);
  if (header) {
    if (current) {
      sections.push(current);
    }
    current = { name: header[1].trim(), lines: [] };
    continue;
  }

  if (current) {
    current.lines.push(line);
  }
}

if (current) {
  sections.push(current);
}

function getSectionBody(name) {
  if (!name) {
    return null;
  }

  const target = sections.find((section) => section.name.toLowerCase() === name.toLowerCase());
  return target ? target.lines.join('\n').trim() : null;
}

function sanitizeNotes(input) {
  if (!input) {
    return '';
  }

  const lines = input
    .split('\n')
    .filter((line) => !/版本升级到\s*v?\d/i.test(line))
    .map((line) => line.trimEnd());

  return lines.join('\n').trim();
}

function formatNotes(input) {
  if (!input) {
    return '';
  }

  const lines = sanitizeNotes(input).split('\n');
  const items = [];
  let currentCategory = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const sectionHeading = line.match(/^###\s*(新增|优化|修复|更新日志)\s*$/);
    if (sectionHeading) {
      currentCategory = sectionHeading[1] === '更新日志' ? null : sectionHeading[1];
      continue;
    }

    const numberedLine = line.match(/^\d+\.\s*(新增|优化|修复)\s*[：:]\s*(.+)$/);
    if (numberedLine) {
      items.push({ category: numberedLine[1], text: numberedLine[2].trim() });
      continue;
    }

    const bulletLine = line.match(/^[-*]\s+(.+)$/);
    if (bulletLine && currentCategory) {
      items.push({ category: currentCategory, text: bulletLine[1].trim() });
    }
  }

  if (!items.length) {
    return '';
  }

  return ['### 更新日志', '', ...items.map((item, index) => `${index + 1}. ${item.category}：${item.text}`)].join('\n');
}

let notes = formatNotes(getSectionBody(releaseVersion));

if (!notes) {
  const latestStable = sections.find((section) => /^\d+\.\d+\.\d+$/.test(section.name));
  notes = formatNotes(latestStable ? latestStable.lines.join('\n').trim() : '');
}

if (!notes) {
  notes = [
    '### 更新日志',
    '',
    '1. 新增：暂无。',
    '2. 优化：持续优化整体体验，让使用过程更顺手。',
    '3. 修复：修复已知问题，提升版本稳定性。',
  ].join('\n');
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${notes}\nEOF\n`);
} else {
  process.stdout.write(notes);
}
