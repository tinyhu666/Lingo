export function buildCosCopySource(bucket, region, key) {
  const encodedKey = String(key)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${bucket}.cos.${region}.myqcloud.com/${encodedKey}`;
}

export async function mapWithConcurrency(items, limit, handler) {
  const queue = Array.from(items);
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, queue.length || 1));
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const index = nextIndex;
      nextIndex += 1;
      await handler(queue[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
