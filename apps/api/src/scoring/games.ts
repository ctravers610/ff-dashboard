// This week's NFL games from ESPN's public scoreboard: scores (for defenses'
// points allowed) and how far along each game is (for live projections).

import { cached, MINUTE } from '../cache.js';
import { config } from '../config.js';

interface EspnScoreboard {
  events: {
    competitions: {
      status: { clock?: number; period?: number; type: { state: 'pre' | 'in' | 'post' } };
      competitors: { score: string; team: { abbreviation: string } }[];
    }[];
  }[];
}

export interface GameScore {
  opponent: string;
  opponentScore: number;
  started: boolean;
  progress: number; // 0 = not started, 1 = final
}

// ESPN and Sleeper disagree on a couple of team codes.
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: 'WAS' };

// Share of a 60-minute game that has been played (overtime counts as nearly done).
export function gameProgress(state: 'pre' | 'in' | 'post', period = 0, clockSeconds = 0): number {
  if (state === 'pre') return 0;
  if (state === 'post') return 1;
  if (period > 4) return 0.98;
  const played = (period - 1) * 15 * 60 + (15 * 60 - clockSeconds);
  return Math.min(0.98, Math.max(0, played / 3600));
}

async function fetchGames(season: string, week: number): Promise<Map<string, GameScore>> {
  const url = `${config.upstream.espnScoreboard}?seasontype=2&week=${week}&dates=${season}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard returned HTTP ${res.status}`);
  const board = (await res.json()) as EspnScoreboard;

  const games = new Map<string, GameScore>();
  for (const event of board.events) {
    const game = event.competitions[0];
    if (!game || game.competitors.length !== 2) continue;
    const { state } = game.status.type;
    const progress = gameProgress(state, game.status.period, game.status.clock);
    const [a, b] = game.competitors as [(typeof game.competitors)[0], (typeof game.competitors)[0]];
    const code = (abbr: string) => ESPN_TO_SLEEPER[abbr] ?? abbr;
    const started = state !== 'pre';
    games.set(code(a.team.abbreviation), { opponent: code(b.team.abbreviation), opponentScore: Number(b.score), started, progress });
    games.set(code(b.team.abbreviation), { opponent: code(a.team.abbreviation), opponentScore: Number(a.score), started, progress });
  }
  return games;
}

// team code → game, refreshed at most once a minute.
export const nflGames = (season: string, week: number) =>
  cached(`games:${season}:${week}`, MINUTE, () => fetchGames(season, week));
