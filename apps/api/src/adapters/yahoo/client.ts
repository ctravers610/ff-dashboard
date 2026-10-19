import { cached, MINUTE } from '../../cache.js';
import { getAccessToken } from './auth.js';

const BASE_URL = 'https://fantasysports.yahooapis.com/fantasy/v2';

// GET a Yahoo Fantasy resource as JSON, e.g. "users;use_login=1/games;game_codes=nfl/leagues".
export async function yahooGet<T = unknown>(resource: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Yahoo is not connected');

  const separator = resource.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE_URL}/${resource}${separator}format=json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Yahoo rejected the access token; try reconnecting Yahoo');
  // Since mid-2026 Yahoo only serves Fantasy data to apps it has approved
  // (apply at sports.yahoo.com/developer); unapproved apps get 403 everywhere.
  if (res.status === 403) {
    throw new Error("Yahoo hasn't approved this app for Fantasy API access yet (apply at sports.yahoo.com/developer)");
  }
  if (!res.ok) throw new Error(`Yahoo ${resource} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const yahooCached = <T = unknown>(resource: string, ttlMs = MINUTE) =>
  cached(`yahoo:${resource}`, ttlMs, () => yahooGet<T>(resource));
