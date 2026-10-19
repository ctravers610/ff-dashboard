// Live fantasy points: Sleeper's in-game stat feed scored with a league's rules,
// plus ESPN's public scoreboard for each defense's points allowed.

import type { Player } from '@ffd/shared';
import { cached, MINUTE } from '../cache.js';
import type { ScoringRules } from './rules.js';
import { scoreStats } from './score.js';

interface StatRow {
  player_id: string;
  stats: Record<string, number>;
}

interface EspnScoreboard {
  events: {
    competitions: {
      status: { type: { state: 'pre' | 'in' | 'post' } };
      competitors: { score: string; team: { abbreviation: string } }[];
    }[];
  }[];
}

// ESPN and Sleeper disagree on a couple of team codes.
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: 'WAS' };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function weeklyStats(season: string, week: number): Promise<Map<string, Record<string, number>>> {
  const rows = await getJson<StatRow[]>(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular`);
  return new Map(rows.map((r) => [r.player_id, r.stats ?? {}]));
}

interface GameScore {
  opponent: string;
  opponentScore: number;
  started: boolean;
}

// team → its opponent and the opponent's current score.
export async function scoreboard(season: string, week: number): Promise<Map<string, GameScore>> {
  const board = await getJson<EspnScoreboard>(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`,
  );
  const games = new Map<string, GameScore>();
  for (const event of board.events) {
    const game = event.competitions[0];
    if (!game || game.competitors.length !== 2) continue;
    const started = game.status.type.state !== 'pre';
    const [a, b] = game.competitors as [(typeof game.competitors)[0], (typeof game.competitors)[0]];
    const code = (abbr: string) => ESPN_TO_SLEEPER[abbr] ?? abbr;
    games.set(code(a.team.abbreviation), { opponent: code(b.team.abbreviation), opponentScore: Number(b.score), started });
    games.set(code(b.team.abbreviation), { opponent: code(a.team.abbreviation), opponentScore: Number(a.score), started });
  }
  return games;
}

// FFPC only counts points scored while the defense is on the field, so remove
// the opponent's own defensive/return TDs (6 + an assumed PAT each).
export function pointsAllowed(game: GameScore | undefined, opponentDefense: Record<string, number> = {}): number | null {
  if (!game?.started) return null;
  const nonOffensiveTds = (opponentDefense.def_td ?? 0) + (opponentDefense.def_st_td ?? 0);
  return Math.max(0, game.opponentScore - 7 * nonOffensiveTds);
}

export type LiveScorer = (player: Player) => number;

// Builds a scorer for this week. Data refreshes at most once a minute.
export async function liveScorer(season: string, week: number, rules: ScoringRules): Promise<LiveScorer> {
  const [stats, games] = await Promise.all([
    cached(`live:stats:${season}:${week}`, MINUTE, () => weeklyStats(season, week)),
    cached(`live:scoreboard:${season}:${week}`, MINUTE, () => scoreboard(season, week)),
  ]);
  return (player) => {
    let allowed: number | null = null;
    if (player.position === 'DEF') {
      // Sleeper keys team defenses by team code, e.g. "SEA".
      const game = games.get(player.nflTeam ?? player.playerId);
      allowed = pointsAllowed(game, game ? stats.get(game.opponent) : undefined);
    }
    return scoreStats(stats.get(player.playerId) ?? {}, player.position, rules, allowed);
  };
}
