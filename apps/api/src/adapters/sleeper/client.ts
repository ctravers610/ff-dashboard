import fs from 'node:fs/promises';
import path from 'node:path';
import { cached, DAY, HOUR, MINUTE } from '../../cache.js';
import { config } from '../../config.js';
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperState,
  SleeperUser,
} from './types.js';

async function get<T>(urlPath: string): Promise<T> {
  const res = await fetch(config.upstream.sleeperApi + urlPath);
  if (!res.ok) throw new Error(`Sleeper ${urlPath} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface RawPlayer {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  injury_status?: string | null;
}

// Sleeper asks clients to fetch /players/nfl at most once a day, so we keep a
// slimmed-down copy on disk and only refresh it when it is a day old.
async function loadPlayers(): Promise<SleeperPlayerMap> {
  const file = path.join(config.cacheDir, 'sleeper-players.json');
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < DAY) return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    // no cached copy yet
  }

  const raw = await get<Record<string, RawPlayer>>('/players/nfl');
  const players: SleeperPlayerMap = {};
  for (const [id, p] of Object.entries(raw)) {
    players[id] = {
      name: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
      position: p.position ?? '',
      team: p.team ?? null,
      injury_status: p.injury_status ?? null,
    };
  }
  await fs.mkdir(config.cacheDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(players));
  return players;
}

export const sleeperClient = {
  state: () => cached('sleeper:state', 10 * MINUTE, () => get<SleeperState>('/state/nfl')),
  user: (username: string) =>
    cached(`sleeper:user:${username.toLowerCase()}`, DAY, () =>
      get<SleeperUser | null>(`/user/${encodeURIComponent(username)}`),
    ),
  leagues: (userId: string, season: string) =>
    cached(`sleeper:leagues:${userId}:${season}`, HOUR, () =>
      get<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`),
    ),
  leagueUsers: (leagueId: string) =>
    cached(`sleeper:users:${leagueId}`, HOUR, () => get<SleeperUser[]>(`/league/${leagueId}/users`)),
  rosters: (leagueId: string) =>
    cached(`sleeper:rosters:${leagueId}`, 5 * MINUTE, () => get<SleeperRoster[]>(`/league/${leagueId}/rosters`)),
  matchups: (leagueId: string, week: number) =>
    cached(`sleeper:matchups:${leagueId}:${week}`, MINUTE, () =>
      get<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`),
    ),
  players: () => cached('sleeper:players', HOUR, loadPlayers),
  // A week's transactions; processed waiver claims show when the league's waivers run.
  transactions: (leagueId: string, week: number) =>
    cached(`sleeper:transactions:${leagueId}:${week}`, 6 * HOUR, () =>
      get<{ type: string; status: string; status_updated: number }[]>(`/league/${leagueId}/transactions/${week}`),
    ),
  // Players added (or dropped) most by all Sleeper users in the last day.
  trending: (type: 'add' | 'drop') =>
    cached(`sleeper:trending:${type}`, 15 * MINUTE, () =>
      get<{ player_id: string; count: number }[]>(`/players/nfl/trending/${type}?lookback_hours=24&limit=100`),
    ),
};
