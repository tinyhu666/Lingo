import { createHash } from 'node:crypto';

// Production can keep its automatically maintained catalog outside code releases.
// An explicitly configured missing/broken file must fail closed, not use stale data.
export const officialGlossaryPath = process.env.GLOSSARY_OFFICIAL_PATH
  || new URL('./glossary/official.json', import.meta.url);
export const curatedGlossaryPath = new URL('./glossary/curated.json', import.meta.url);

export function glossaryRevision(official, curated) {
  return createHash('sha256').update(JSON.stringify([official.revision, curated])).digest('hex').slice(0, 12);
}
