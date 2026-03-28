import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const LABEL_UPDATE_LOG = '\u66f4\u65b0\u65e5\u5fd7';
const LABEL_ADDED = '\u65b0\u589e';
const LABEL_OPTIMIZED = '\u4f18\u5316';
const LABEL_FIXED = '\u4fee\u590d';
const LABEL_NONE = '\u6682\u65e0';
const CATEGORY_ORDER = [LABEL_ADDED, LABEL_OPTIMIZED, LABEL_FIXED];

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

  return input
    .split('\n')
    .filter((line) => !/\u7248\u672c\u5347\u7ea7\u5230\s*v?\d/i.test(line))
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function createGroupedItems() {
  return new Map(CATEGORY_ORDER.map((category) => [category, []]));
}

function ensureSentenceEnd(text) {
  if (!text) {
    return `${LABEL_NONE}\u3002`;
  }

  return /[\u3002\uff01\uff1f]$/.test(text) ? text : `${text}\u3002`;
}

function normalizeSummaryItem(text) {
  return text.trim().replace(/[\u3002\uff01\uff1f]+$/g, '');
}

function formatNotes(input) {
  const cleaned = sanitizeNotes(input);
  const grouped = createGroupedItems();

  if (cleaned) {
    let currentCategory = null;

    for (const rawLine of cleaned.split('\n')) {
      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      const headingMatch = line.match(
        new RegExp(`^###\\s*(${LABEL_UPDATE_LOG}|${LABEL_ADDED}|${LABEL_OPTIMIZED}|${LABEL_FIXED})\\s*$`),
      );
      if (headingMatch) {
        currentCategory = CATEGORY_ORDER.includes(headingMatch[1]) ? headingMatch[1] : null;
        continue;
      }

      const numberedMatch = line.match(
        new RegExp(`^\\d+\\.\\s*(${LABEL_ADDED}|${LABEL_OPTIMIZED}|${LABEL_FIXED})\\s*[：:]\\s*(.+)$`),
      );
      if (numberedMatch) {
        grouped.get(numberedMatch[1]).push(numberedMatch[2].trim());
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        grouped.get(currentCategory ?? LABEL_FIXED).push(bulletMatch[1].trim());
      }
    }
  }

  const lines = [`### ${LABEL_UPDATE_LOG}`, ''];

  CATEGORY_ORDER.forEach((category, index) => {
    const items = grouped.get(category) ?? [];
    const summary = items.length ? items.map(normalizeSummaryItem).join('\uff1b') : LABEL_NONE;
    lines.push(`${index + 1}. ${category}\uff1a${ensureSentenceEnd(summary)}`);
  });

  return lines.join('\n');
}

let notes = formatNotes(getSectionBody(releaseVersion));

if (!notes) {
  const latestStable = sections.find((section) => /^\d+\.\d+\.\d+$/.test(section.name));
  notes = formatNotes(latestStable ? latestStable.lines.join('\n').trim() : '');
}

if (!notes) {
  notes = [
    `### ${LABEL_UPDATE_LOG}`,
    '',
    `1. ${LABEL_ADDED}\uff1a${LABEL_NONE}\u3002`,
    `2. ${LABEL_OPTIMIZED}\uff1a\u6301\u7eed\u4f18\u5316\u6574\u4f53\u4f53\u9a8c\uff0c\u8ba9\u4f7f\u7528\u8fc7\u7a0b\u66f4\u987a\u624b\u3002`,
    `3. ${LABEL_FIXED}\uff1a\u4fee\u590d\u5df2\u77e5\u95ee\u9898\uff0c\u63d0\u5347\u7248\u672c\u7a33\u5b9a\u6027\u3002`,
  ].join('\n');
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${notes}\nEOF\n`);
} else {
  process.stdout.write(notes);
}
