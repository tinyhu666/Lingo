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

  const lines = input.split('\n').filter((line) => !/版本升级到\s*v?\d/i.test(line));
  return lines.join('\n').trim();
}

let notes = sanitizeNotes(getSectionBody(releaseVersion));

if (!notes) {
  const latestStable = sections.find((section) => /^\d+\.\d+\.\d+$/.test(section.name));
  notes = sanitizeNotes(latestStable ? latestStable.lines.join('\n').trim() : '');
}

if (!notes) {
  notes = '### 修复\n- 本次发布包含稳定性与体验优化。';
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${notes}\nEOF\n`);
} else {
  process.stdout.write(notes);
}
