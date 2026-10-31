// Chat-ready cleanup of raw model output. Models occasionally wrap the
// translation in quotes, prefix it with a label, or emit a stray newline;
// any of those pasted into a game chat box looks broken to the player.

const LABEL_PREFIX = /^(?:translation|translated(?: text)?|output|result|译文|翻译|输出)\s*[:：]\s*/iu;
const QUOTE_PAIRS = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['「', '」'],
  ['『', '』'],
  ['«', '»'],
  ['`', '`'],
];

const stripThinking = (value) => {
  const end = value.indexOf('</think>');
  return end >= 0 ? value.slice(end + '</think>'.length) : value;
};

const stripWrappingQuotes = (value) => {
  let current = value;
  for (let round = 0; round < 2; round += 1) {
    const pair = QUOTE_PAIRS.find(
      ([open, close]) => current.length > 1 && current.startsWith(open) && current.endsWith(close),
    );
    if (!pair) {
      return current;
    }
    const inner = current.slice(pair[0].length, current.length - pair[1].length).trim();
    // A quote that also appears inside the text is part of the message
    // (e.g. a quoted callout) and must not be removed from the ends only.
    if (!inner || inner.includes(pair[0]) || inner.includes(pair[1])) {
      return current;
    }
    current = inner;
  }
  return current;
};

export const sanitizeTranslatedText = (raw) => {
  const original = String(raw || '').trim();
  if (!original) {
    return '';
  }
  let value = stripThinking(original).replace(/\s*\r?\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  value = value.replace(LABEL_PREFIX, '').trim();
  value = stripWrappingQuotes(value).trim();
  return value || original;
};
