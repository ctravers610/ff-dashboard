// Live fantasy points and projections: Sleeper's in-game stat feed and weekly
// projections scored with a league's rules, plus ESPN's public scoreboard for
// defenses' points allowed and each game's progress.

import type { Player } from '@ffd/shared';
import { cached, MINUTE } from '../cache.js';
import { nflGames, type GameScore } from './games.js';
import { liveProjection, weeklyProjections } from './projection.js';
import type { ScoringRules } from './rules.js';
import { scoreStats } from './score.js';

interface StatRow {
  player_id: string;
  stats: Record<string, number>;
}

async function fetchStats(season: string, week: number): Promise<Map<string, Record<string, number>>> {
  const res = await fetch(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular`);
  if (!res.ok) throw new Error(`Sleeper stats returned HTTP ${res.status}`);
  const rows = (await res.json()) as StatRow[];
  return new Map(rows.map((r) => [r.player_id, r.stats ?? {}]));
}

export const weeklyStats = (season: string, week: number) =>
  cached(`live:stats:${season}:${week}`, MINUTE, () => fetchStats(season, week));

// FFPC only counts points scored while the defense is on the field, so remove
// the opponent's own defensive/return TDs (6 + an assumed PAT each).
export function pointsAllowed(game: GameScore | undefined, opponentDefense: Record<string, number> = {}): number | null {
  if (!game?.started) return null;
  const nonOffensiveTds = (opponentDefense.def_td ?? 0) + (opponentDefense.def_st_td ?? 0);
  return Math.max(0, game.opponentScore - 7 * nonOffensiveTds);
}

export interface LivePoints {
  points: number;
  projected: number | null;
}

export type LiveScorer = (player: Player) => LivePoints;

// Builds a scorer for this week. Projections are optional: if that feed is
// down, players still get live points.
export async function liveScorer(season: string, week: number, rules: ScoringRules): Promise<LiveScorer> {
  const [stats, games, projections] = await Promise.all([
    weeklyStats(season, week),
    nflGames(season, week),
    weeklyProjections(season, week).catch(() => null),
  ]);
  return (player) => {
    // Sleeper keys team defenses by team code, e.g. "SEA".
    const game = games.get(player.nflTeam ?? player.playerId);
    const isDef = player.position === 'DEF';
    const allowed = isDef ? pointsAllowed(game, game ? stats.get(game.opponent) : undefined) : null;
    const points = scoreStats(stats.get(player.playerId) ?? {}, player.position, rules, allowed);

    const projStats = projections?.get(player.playerId);
    if (!projStats) return { points, projected: projections ? liveProjection(points, 0, game?.progress ?? 0) : null };
    const projectedFull = scoreStats(projStats, player.position, rules, isDef ? (projStats.pts_allow ?? null) : null);
    return { points, projected: liveProjection(points, projectedFull, game?.progress ?? 0) };
  };
}
