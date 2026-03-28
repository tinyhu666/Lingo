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
const FALLBACK_RELEASE_TEXT = '\u4fee\u590d\u5df2\u77e5\u95ee\u9898';
const DEFAULT_RELEASE_NOTES = `### ${LABEL_UPDATE_LOG}\n\n1. ${FALLBACK_RELEASE_TEXT}\u3002`;

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
  return /[\u3002\uff01\uff1f]$/.test(text) ? text : `${text}\u3002`;
}

function normalizeSummaryItem(text) {
  return text.trim().replace(/[\u3002\uff01\uff1f]+$/g, '');
}

function isEmptyCategoryItem(text) {
  const normalized = normalizeSummaryItem(text);
  return !normalized || normalized === LABEL_NONE;
}

function isFallbackCategoryItem(text) {
  return normalizeSummaryItem(text) === FALLBACK_RELEASE_TEXT;
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
        new RegExp(`^\\d+\\.\\s*(${LABEL_ADDED}|${LABEL_OPTIMIZED}|${LABEL_FIXED})\\s*[:：]\\s*(.+)$`),
      );
      if (numberedMatch) {
        if (!isEmptyCategoryItem(numberedMatch[2])) {
          grouped.get(numberedMatch[1]).push(numberedMatch[2].trim());
        }
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch && !isEmptyCategoryItem(bulletMatch[1])) {
        grouped.get(currentCategory ?? LABEL_FIXED).push(bulletMatch[1].trim());
      }
    }
  }

  const visibleCategories = CATEGORY_ORDER
    .map((category) => [category, grouped.get(category) ?? []])
    .filter(([, items]) => items.length);

  if (!visibleCategories.length) {
    return DEFAULT_RELEASE_NOTES;
  }

  if (
    visibleCategories.length === 1 &&
    visibleCategories[0][0] === LABEL_FIXED &&
    visibleCategories[0][1].length === 1 &&
    isFallbackCategoryItem(visibleCategories[0][1][0])
  ) {
    return DEFAULT_RELEASE_NOTES;
  }

  const lines = [`### ${LABEL_UPDATE_LOG}`, ''];

  visibleCategories.forEach(([category, items], index) => {
    const summary = items.map(normalizeSummaryItem).join('\uff1b');
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
  notes = DEFAULT_RELEASE_NOTES;
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${notes}\nEOF\n`);
} else {
  process.stdout.write(notes);
}
