// One minute covers repeated callouts while keeping text in a bounded,
// process-local cache. Hits do not extend the original retention deadline.
export const createTranslationCache = ({ ttlMs = 60_000, maxEntries = 256, now = Date.now } = {}) => {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      const timestamp = now();
      for (const [cachedKey, entry] of entries) {
        if (entry.expiresAt <= timestamp) entries.delete(cachedKey);
      }
      entries.delete(key);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { value, expiresAt: timestamp + ttlMs });
    },
  };
};
