import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const glossaryDirectory = new URL('../src/glossary/', import.meta.url);
const locales = { en: 'en_US', zh: 'zh_CN', ru: 'ru_RU' };
const valveLocales = { en: 'english', zh: 'schinese', ru: 'russian' };
const blizzardLocales = { en: 'en-us', zh: 'zh-cn', ru: 'ru-ru' };

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
const fetchJson = async (url) => JSON.parse(await fetchText(url));
const clean = (value) => String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function parseBlizzardCards(html, kind) {
  const entries = {};
  const pattern = kind === 'heroes'
    ? /<a\b[^>]*href="\/heroes\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/g
    : /<a\b[^>]*href="\/game\/classes\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const heading = match[2].match(/<(?:h2|div)\b[^>]*slot="heading"[^>]*>([\s\S]*?)<\/(?:h2|div)>/);
    if (heading) entries[match[1]] = clean(heading[1]);
  }
  return entries;
}

export function mergeLocalized(game, kind, tables, source, excluded = []) {
  const entries = [];
  // Require the same stable ID in all locales; never align by array position.
  for (const id of Object.keys(tables.en).sort()) {
    const names = Object.fromEntries(Object.keys(locales).map((locale) => [locale, clean(tables[locale][id])]));
    if (Object.values(names).some((name) => !name)) {
      excluded.push(`${game}:${kind}:${id}`);
      continue;
    }
    entries.push({ id: `${game}:${kind}:${id}`, game, kind, names, source });
  }
  return entries;
}

export function validateCatalog(catalog, previous) {
  const ids = new Set();
  const minimums = { dota2: 200, lol: 300, overwatch: 40, wow: 13 };
  for (const entry of catalog.entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate ID: ${entry.id}`);
    ids.add(entry.id);
    if (!minimums[entry.game] || !catalog.sources[entry.source]) throw new Error(`Invalid source/game: ${entry.id}`);
    for (const locale of Object.keys(locales)) {
      const name = entry.names[locale];
      if (typeof name !== 'string' || !name.trim() || name.length > 160 || /[\r\n<>]/u.test(name)) {
        throw new Error(`Invalid ${locale} name: ${entry.id}`);
      }
    }
  }
  for (const [game, minimum] of Object.entries(minimums)) {
    const entries = catalog.entries.filter((entry) => entry.game === game);
    const oldCount = previous?.entries.filter((entry) => entry.game === game).length || 0;
    if (entries.length < Math.max(minimum, oldCount * 0.8)) throw new Error(`${game}: unexpected catalog shrink (${entries.length}/${oldCount})`);
    if (entries.filter((entry) => /\p{Script=Han}/u.test(entry.names.zh)).length < entries.length * 0.7) {
      throw new Error(`${game}: Chinese locale appears to be a fallback page`);
    }
    // Valve intentionally retains English names for many Russian item names.
    if (game !== 'dota2' && entries.filter((entry) => /\p{Script=Cyrillic}/u.test(entry.names.ru)).length < entries.length * 0.7) {
      throw new Error(`${game}: Russian locale appears to be a fallback page`);
    }
  }
}

export async function fetchCatalog() {
  const sources = {};
  const excluded = [];
  const groups = await Promise.all([
    (async () => {
      const output = [];
      for (const [endpoint, field, kind] of [['herolist', 'heroes', 'hero'], ['itemlist', 'itemabilities', 'item']]) {
        const source = `valve-${kind}`;
        sources[source] = { publisher: 'Valve', urls: {} };
        const tables = Object.fromEntries(await Promise.all(Object.entries(valveLocales).map(async ([locale, language]) => {
          const url = `https://www.dota2.com/datafeed/${endpoint}?language=${language}`;
          sources[source].urls[locale] = url;
          const data = (await fetchJson(url)).result?.data?.[field];
          if (!Array.isArray(data)) throw new Error(`Invalid Valve ${kind} schema`);
          return [locale, Object.fromEntries(data.filter((entry) => !entry.name.startsWith('item_recipe_') && entry.name_loc.trim()).map((entry) => [entry.name, entry.name_loc]))];
        })));
        output.push(...mergeLocalized('dota2', kind, tables, source, excluded));
      }
      return output;
    })(),
    (async () => {
      const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json');
      const version = versions[0];
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Data Dragon version');
      const output = [];
      for (const kind of ['champion', 'item', 'summoner']) {
        const source = `riot-${kind}`;
        sources[source] = { publisher: 'Riot Games', version, urls: {} };
        const tables = Object.fromEntries(await Promise.all(Object.entries(locales).map(async ([locale, code]) => {
          const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${code}/${kind}.json`;
          sources[source].urls[locale] = url;
          const data = (await fetchJson(url)).data;
          if (!data || typeof data !== 'object') throw new Error(`Invalid Data Dragon ${kind} schema`);
          return [locale, Object.fromEntries(Object.entries(data).map(([id, entry]) => [id, entry.name]))];
        })));
        // Arena / map variants often have identical names. Keep the first stable ID.
        const seen = new Set();
        for (const entry of mergeLocalized('lol', kind, tables, source, excluded)) {
          const key = JSON.stringify(entry.names);
          if (!seen.has(key)) { output.push(entry); seen.add(key); }
        }
      }
      return output;
    })(),
    (async () => {
      const source = 'blizzard-overwatch';
      const cnPage = 'https://ow.blizzard.cn/heroes/';
      const html = await fetchText(cnPage);
      // The official CN page links a versioned asset directory containing its hero data.
      const asset = html.match(/https:\/\/ld5\.res\.netease\.com\/pc\/zt\/\d+\/js\/heroes\/index_[\w]+\.js/);
      if (!asset) throw new Error('Overwatch CN hero asset not found');
      const cnData = `${asset[0].split('/js/')[0]}/static/heroConfigs.json`;
      sources[source] = { publisher: 'Blizzard / NetEase', page: cnPage, urls: { zh: cnData } };
      const tables = Object.fromEntries(await Promise.all(['en', 'ru'].map(async (locale) => {
        const url = `https://overwatch.blizzard.com/${blizzardLocales[locale]}/heroes/`;
        sources[source].urls[locale] = url;
        return [locale, parseBlizzardCards(await fetchText(url), 'heroes')];
      })));
      const cn = (await fetchJson(cnData)).heroConfigs;
      if (!Array.isArray(cn)) throw new Error('Invalid Overwatch CN schema');
      // The two official sites use different slugs for Jetpack Cat.
      tables.zh = Object.fromEntries(cn.map((entry) => [entry.id === 'jetpackcat' ? 'jetpack-cat' : entry.id, entry.name]));
      return mergeLocalized('overwatch', 'hero', tables, source, excluded);
    })(),
    (async () => {
      const source = 'blizzard-wow';
      sources[source] = { publisher: 'Blizzard', urls: {} };
      const tables = Object.fromEntries(await Promise.all(Object.entries(blizzardLocales).map(async ([locale, code]) => {
        const url = `https://worldofwarcraft.blizzard.com/${code}/game/classes`;
        sources[source].urls[locale] = url;
        return [locale, parseBlizzardCards(await fetchText(url), 'classes')];
      })));
      return mergeLocalized('wow', 'class', tables, source, excluded);
    })(),
  ]);
  // Sort every map for deterministic output, independent of network completion order.
  const sortedSources = Object.fromEntries(Object.keys(sources).sort().map((id) => [id, {
    ...sources[id], urls: Object.fromEntries(Object.entries(sources[id].urls).sort()),
  }]));
  const entries = groups.flat().sort((a, b) => a.id.localeCompare(b.id, 'en'));
  excluded.sort();
  const revision = createHash('sha256').update(JSON.stringify({ sources: sortedSources, entries, excluded })).digest('hex').slice(0, 12);
  return { schemaVersion: 1, revision, updatedAt: new Date().toISOString().slice(0, 10), sources: sortedSources, excluded, entries };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--check', '--write'].includes(arg)) || args.length > 1) throw new Error('Usage: update-glossary.mjs [--check|--write]');
  const path = new URL('official.json', glossaryDirectory);
  let previous;
  try { previous = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const catalog = await fetchCatalog();
  validateCatalog(catalog, previous);
  // A removed upstream ID must never leave runtime aliases dangling.
  try {
    const curated = JSON.parse(await readFile(new URL('curated.json', glossaryDirectory), 'utf8'));
    const ids = new Set(catalog.entries.map((entry) => entry.id));
    for (const alias of curated.aliases) if (!ids.has(alias.ref)) throw new Error(`Update requires alias review: ${alias.ref}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const changed = catalog.revision !== previous?.revision;
  const oldEntries = new Map((previous?.entries || []).map((entry) => [entry.id, entry]));
  const newIds = new Set(catalog.entries.map((entry) => entry.id));
  const delta = {
    added: catalog.entries.filter((entry) => !oldEntries.has(entry.id)).map((entry) => entry.id),
    renamed: catalog.entries.filter((entry) => oldEntries.has(entry.id) && JSON.stringify(entry.names) !== JSON.stringify(oldEntries.get(entry.id).names)).map((entry) => entry.id),
    removed: [...oldEntries.keys()].filter((id) => !newIds.has(id)),
  };
  const counts = Object.fromEntries(['dota2', 'lol', 'overwatch', 'wow'].map((game) => [game, catalog.entries.filter((entry) => entry.game === game).length]));
  if (changed && args.includes('--write')) {
    await mkdir(glossaryDirectory, { recursive: true });
    const temporary = new URL(`official.${process.pid}.tmp`, glossaryDirectory);
    await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`);
    await rename(temporary, path);
  }
  console.log(JSON.stringify({ changed, written: changed && args.includes('--write'), revision: catalog.revision, counts, excluded: catalog.excluded, delta }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
