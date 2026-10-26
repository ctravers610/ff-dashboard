import { describe, expect, it } from 'vitest';
import { fetchWithRetry, retryDelay } from './client.js';

const reply = (status: number, headers: Record<string, string> = {}) => new Response('{}', { status, headers });

/** A fake fetch that answers with the given statuses in turn, and a sleep that records its waits. */
function scripted(statuses: (number | Error)[]) {
  const waits: number[] = [];
  let calls = 0;
  const fetchImpl = (async () => {
    const next = statuses[Math.min(calls++, statuses.length - 1)]!;
    if (next instanceof Error) throw next;
    return reply(next);
  }) as typeof fetch;
  return { fetchImpl, sleep: async (ms: number) => void waits.push(ms), waits, calls: () => calls };
}

describe('retryDelay', () => {
  it('backs off exponentially from one second, capped', () => {
    expect(retryDelay(0, null)).toBeGreaterThanOrEqual(1000);
    expect(retryDelay(0, null)).toBeLessThan(1300);
    expect(retryDelay(2, null)).toBeGreaterThanOrEqual(4000);
    expect(retryDelay(10, null)).toBe(30_000);
  });

  it("follows Yahoo's Retry-After when it sends one", () => {
    expect(retryDelay(0, '7')).toBe(7000);
  });
});

describe('fetchWithRetry', () => {
  it('retries a throttled call until it succeeds, waiting longer each time', async () => {
    const s = scripted([999, 429, 200]);
    const res = await fetchWithRetry('https://yahoo.example', {}, { fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(res.status).toBe(200);
    expect(s.calls()).toBe(3);
    expect(s.waits[1]!).toBeGreaterThan(s.waits[0]!);
  });

  it('gives up after three retries and returns the last answer', async () => {
    const s = scripted([503]);
    const res = await fetchWithRetry('https://yahoo.example', {}, { fetchImpl: s.fetchImpl, sleep: s.sleep });
    expect(res.status).toBe(503);
    expect(s.calls()).toBe(4);
  });

  it('does not retry an answer that will not change (401, 403, 404)', async () => {
    const s = scripted([403]);
    expect((await fetchWithRetry('https://yahoo.example', {}, { fetchImpl: s.fetchImpl, sleep: s.sleep })).status).toBe(403);
    expect(s.calls()).toBe(1);
  });

  it('retries a network failure, then rethrows it', async () => {
    const s = scripted([new Error('socket hang up')]);
    await expect(fetchWithRetry('https://yahoo.example', {}, { fetchImpl: s.fetchImpl, sleep: s.sleep, retries: 2 })).rejects.toThrow('socket hang up');
    expect(s.calls()).toBe(3);
  });
});
