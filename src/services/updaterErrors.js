const KEY_MISMATCH_PATTERNS = [
  /UnexpectedKeyId/i,
  /key id/i,
  /signature was created with a different key than the one provided/i,
];

export const getUpdaterErrorMessage = (error, fallback = '') =>
  String(error?.message || error || fallback);

export const isUpdaterKeyMismatch = (error) => {
  const message = getUpdaterErrorMessage(error);
  return KEY_MISMATCH_PATTERNS.some((pattern) => pattern.test(message));
};
