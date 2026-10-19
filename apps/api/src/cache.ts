export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const store = new Map<string, { expires: number; value: Promise<unknown> }>();

// In-memory TTL cache. Storing the promise (not the result) means two requests
// that arrive at the same time share one upstream call.
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = load();
  store.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => store.delete(key)); // never cache failures
  return value;
}
