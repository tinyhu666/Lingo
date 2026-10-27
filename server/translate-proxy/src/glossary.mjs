import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const official = JSON.parse(readFileSync(new URL('./glossary/official.json', import.meta.url), 'utf8'));
const curated = JSON.parse(readFileSync(new URL('./glossary/curated.json', import.meta.url), 'utf8'));
export const GLOSSARY_REVISION = createHash('sha256').update(JSON.stringify([official.revision, curated])).digest('hex').slice(0, 12);
export const GLOSSARY_LIMITS = Object.freeze({ terms: 12, characters: 1400 });
const normalize = (text) => String(text || '').normalize('NFKC').toLowerCase();
const wordChar = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Number}_]/u;
const entries = new Map(official.entries.map((entry) => [entry.id, { ...entry, aliases: [], note: '' }]));
for (const alias of curated.aliases) {
  const entry = entries.get(alias.ref);
  if (!entry) throw new Error(`Glossary alias references missing entry: ${alias.ref}`);
  entry.aliases.push(...alias.forms);
  if (alias.note) entry.note = alias.note;
}
for (const entry of curated.terms) {
  if (entries.has(entry.id)) throw new Error(`Duplicate glossary ID: ${entry.id}`);
  entries.set(entry.id, entry);
}

const indexes = new Map();
for (const game of ['dota2', 'lol', 'overwatch', 'wow', 'other']) {
  const forms = new Map();
  for (const entry of entries.values()) {
    if (entry.game !== game && entry.game !== 'common') continue;
    for (const form of [...Object.values(entry.names), ...(entry.aliases || [])]) {
      const key = normalize(form);
      // Single characters (美, D, Q, etc.) are too ambiguous without a parser.
      if (Array.from(key).length < 2 || /^\d+$/u.test(key)) continue;
      if (!forms.has(key)) forms.set(key, new Map());
      forms.get(key).set(entry.id, entry);
    }
  }
  const byFirstCharacter = new Map();
  for (const [form, candidates] of forms) {
    const specific = [...candidates.values()].filter((entry) => entry.game === game);
    const selected = specific.length ? specific : [...candidates.values()];
    // An ambiguous alias must not silently pick an arbitrary entity.
    const distinct = new Map(selected.map((entry) => [JSON.stringify(entry.names), entry]));
    if (distinct.size > 1) continue;
    const [entry] = distinct.values();
    const first = form[0];
    if (!byFirstCharacter.has(first)) byFirstCharacter.set(first, []);
    byFirstCharacter.get(first).push({ form, entry });
  }
  for (const bucket of byFirstCharacter.values()) bucket.sort((a, b) => b.form.length - a.form.length);
  indexes.set(game, byFirstCharacter);
}

export function matchGlossary(text, game) {
  const normalized = normalize(text);
  const index = indexes.get(game) || indexes.get('other');
  const found = new Map();
  for (let offset = 0; offset < normalized.length; offset += 1) {
    for (const candidate of index.get(normalized[offset]) || []) {
      const { form, entry } = candidate;
      if (!normalized.startsWith(form, offset)) continue;
      const end = offset + form.length;
      if (wordChar.test(form[0]) && wordChar.test(normalized[offset - 1] || '')) continue;
      if (wordChar.test(form.at(-1)) && wordChar.test(normalized[end] || '')) continue;
      if (!found.has(entry.id)) found.set(entry.id, { ...entry, matched: form });
      offset = end - 1;
      break;
    }
  }
  return [...found.values()];
}

export function glossaryPrompt(text, game, targetLanguage) {
  const target = targetLanguage === 'en-SEA' ? 'en' : targetLanguage;
  const lines = [];
  let length = 0;
  for (const entry of matchGlossary(text, game)) {
    // Without a verified target name, leave localization to the model.
    // Supplying an English replacement here would contaminate other languages.
    if (!entry.names[target]) continue;
    const line = `${JSON.stringify(entry.matched)} => ${JSON.stringify(entry.names[target])}${entry.note ? ` (${entry.note})` : ''}`;
    if (lines.length >= GLOSSARY_LIMITS.terms || length + line.length > GLOSSARY_LIMITS.characters) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.length ? `Relevant glossary (use only when context fits; never add absent entities):\n${lines.join('\n')}` : '';
}

// Narrow allowance for conventional chat tokens. Ordinary untranslated sentences
// still trigger the existing fallback. Locale-specific names are not invariants.
const invariantTokens = new Set(curated.invariantTokens.map(normalize));
export function isInvariantChat(text) {
  const words = normalize(text).match(/[\p{L}\p{N}_]+/gu) || [];
  return words.length > 0 && words.some((word) => invariantTokens.has(word))
    && words.every((word) => invariantTokens.has(word) || /^\d+$/u.test(word));
}

export const glossaryStats = Object.freeze({
  revision: GLOSSARY_REVISION,
  officialRevision: official.revision,
  officialTerms: official.entries.length,
  curatedTerms: curated.terms.length,
  aliasGroups: curated.aliases.length,
});
