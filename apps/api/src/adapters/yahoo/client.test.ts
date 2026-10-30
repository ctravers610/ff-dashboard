import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, retryDelay, yahooGet, yahooTtl } from './client.js';

vi.mock('./auth.js', () => ({ getAccessToken: async () => 'token' }));

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

describe('yahooTtl', () => {
  it('keeps live scores briefly and what rarely changes for longer', () => {
    expect(yahooTtl('team/1.l.2.t.3/roster;week=8/players/stats;type=week;week=8')).toBe(60_000);
    expect(yahooTtl('team/1.l.2.t.3/matchups;weeks=8')).toBe(60_000);
    expect(yahooTtl('league/1.l.2/transactions;types=add')).toBe(300_000);
    expect(yahooTtl('league/1.l.2/standings')).toBe(300_000);
    expect(yahooTtl('league/1.l.2;out=settings')).toBe(3_600_000);
    expect(yahooTtl('users;use_login=1/games;game_keys=nfl/teams')).toBe(3_600_000);
  });
});

describe('yahooGet', () => {
  afterEach(() => vi.useRealTimers());

  it('shares one call between everyone asking, until the answer is stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = scripted([200]);
    const get = () => yahooGet('league/shared/standings', { fetchImpl: s.fetchImpl, sleep: s.sleep });
    await Promise.all([get(), get()]);
    await get();
    expect(s.calls()).toBe(1);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await get();
    expect(s.calls()).toBe(2);
  });

  it('does not keep a failure', async () => {
    const s = scripted([500, 200]);
    const get = () => yahooGet('league/flaky/standings', { fetchImpl: s.fetchImpl, sleep: s.sleep, retries: 0 });
    await expect(get()).rejects.toThrow('HTTP 500');
    await expect(get()).resolves.toEqual({});
  });

  it('leaves Yahoo alone for a while once it throttles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // A stand-in, since new Response() refuses a status of 999; a real fetch hands it back.
    let calls = 0;
    const fetchImpl = (async () => (++calls === 1 ? ({ status: 999, ok: false, headers: new Headers() } as Response) : reply(200))) as typeof fetch;
    const opts = { fetchImpl, sleep: async () => {}, retries: 0 };
    await expect(yahooGet('league/throttled/standings', opts)).rejects.toThrow('HTTP 999');
    await expect(yahooGet('league/other/standings', opts)).rejects.toThrow('trying again in 5 min');
    expect(calls).toBe(1);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await expect(yahooGet('league/other/standings', opts)).resolves.toEqual({});
    expect(calls).toBe(2);
  });
});
