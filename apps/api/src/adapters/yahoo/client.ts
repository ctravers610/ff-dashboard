// The Yahoo Fantasy API. Rate limits are respected:
//   - each answer is kept for a while (yahooTtl), so the live feed, the browser's
//     refreshes and every tab asking at once share one call;
//   - a throttled or failing call is retried a few times with exponential
//     backoff, honoring Yahoo's Retry-After;
//   - once Yahoo throttles anyway, nothing more is asked of it for a few minutes.
// See adapters/yahoo/index.ts for what the dashboard fetches.

import { cached, HOUR, MINUTE } from '../../cache.js';
import { config } from '../../config.js';
import { getAccessToken } from './auth.js';

// Yahoo answers 999 when it throttles; 429 and 5xx are worth another try too.
const RETRYABLE = new Set([429, 500, 502, 503, 504, 999]);
const THROTTLED = new Set([429, 999]);
const COOL_DOWN = 5 * MINUTE;

/** How long Yahoo's answer for a resource is kept: live scores briefly, what rarely changes for longer. */
export function yahooTtl(resource: string): number {
  if (resource.startsWith('users;use_login=1/') || resource.endsWith(';out=settings')) return HOUR; // your teams and leagues, and their settings
  if (/\/roster;week=\d+\/players\/stats|\/matchups;weeks=/.test(resource)) return MINUTE; // this week's points
  return 5 * MINUTE; // standings, rosters, FAAB balances, transactions, available players
}

export interface RetryOptions {
  retries?: number; // after the first try
  baseDelayMs?: number; // doubles each time: 1s, 2s, 4s
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

/** How long to wait before retry number `attempt` (0-based): Retry-After if Yahoo says, else exponential with jitter. */
export function retryDelay(attempt: number, retryAfter: string | null, { baseDelayMs = 1000, maxDelayMs = 30_000 }: RetryOptions = {}): number {
  const seconds = retryAfter != null ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
  const exponential = baseDelayMs * 2 ** attempt;
  return Math.min(exponential + Math.random() * baseDelayMs * 0.25, maxDelayMs);
}

/** fetch, retried with backoff while the answer is a throttle or a server error. */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const { retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), fetchImpl = fetch } = opts;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      if (attempt >= retries) throw e; // the network itself failed every time
    }
    if (res && (!RETRYABLE.has(res.status) || attempt >= retries)) return res;
    await sleep(retryDelay(attempt, res?.headers.get('retry-after') ?? null, opts));
  }
}

let throttledUntil = 0;

// GET a Yahoo Fantasy resource as JSON, e.g. "users;use_login=1/games;game_keys=nfl/teams".
export function yahooGet<T = unknown>(resource: string, opts: RetryOptions = {}): Promise<T> {
  return cached(`yahoo:${resource}`, yahooTtl(resource), () => fetchYahoo<T>(resource, opts));
}

async function fetchYahoo<T>(resource: string, opts: RetryOptions): Promise<T> {
  const wait = throttledUntil - Date.now();
  if (wait > 0) throw new Error(`Yahoo is rate-limiting this app; trying again in ${Math.ceil(wait / MINUTE)} min`);

  const token = await getAccessToken();
  if (!token) throw new Error('Yahoo is not connected');

  const separator = resource.includes('?') ? '&' : '?';
  const res = await fetchWithRetry(`${config.upstream.yahooFantasy}/${resource}${separator}format=json`, { headers: { Authorization: `Bearer ${token}` } }, opts);
  if (res.status === 401) throw new Error('Yahoo rejected the access token; try reconnecting Yahoo');
  // Yahoo only serves Fantasy data to apps it has approved; any other app gets 403 everywhere.
  // An app created before the account's access was approved stays unapproved, and editing it doesn't help.
  if (res.status === 403) {
    throw new Error(
      "Yahoo hasn't turned on Fantasy API access for this app. If the app was created before access was approved, create a new one with Fantasy Sports checked and submit its Client ID at sports.yahoo.com/developer/application-confirmation",
    );
  }
  if (THROTTLED.has(res.status)) throttledUntil = Date.now() + COOL_DOWN; // still throttled after the retries: back off
  if (RETRYABLE.has(res.status)) throw new Error(`Yahoo is rate-limiting or unavailable (HTTP ${res.status}); it will be tried again on the next refresh`);
  if (!res.ok) throw new Error(`Yahoo ${resource} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}
