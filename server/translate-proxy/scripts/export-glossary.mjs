import { readFile, writeFile } from 'node:fs/promises';

const official = JSON.parse(await readFile(new URL('../src/glossary/official.json', import.meta.url), 'utf8'));
const curated = JSON.parse(await readFile(new URL('../src/glossary/curated.json', import.meta.url), 'utf8'));
const aliases = new Map(curated.aliases.map((entry) => [entry.ref, entry]));
const games = { dota2: 'Dota 2', lol: '英雄联盟', overwatch: '守望先锋', wow: '魔兽世界', common: '通用' };
const quote = (value) => {
  let text = String(value || '');
  if (/^[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const rows = [['游戏', '类别', '中文', '英文', '俄文', '人工维护别名', '名称来源', '语境说明']];
for (const entry of [...official.entries, ...curated.terms]) {
  const alias = aliases.get(entry.id);
  rows.push([
    games[entry.game], entry.kind, entry.names.zh, entry.names.en, entry.names.ru,
    (alias?.forms || entry.aliases || []).join(' / '),
    entry.source ? official.sources[entry.source].urls.zh : '项目人工维护（非官方译名认证）',
    alias?.note || entry.note || '',
  ]);
}
const destination = new URL('../../../docs/game-glossary.csv', import.meta.url);
await writeFile(destination, `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\n')}\n`);
console.log(`Exported ${rows.length - 1} glossary rows to docs/game-glossary.csv`);
