// Live projections: before kickoff a player's projection; during the game the
// points he already has plus his projection for the share of the game left;
// once the game is final, just his actual points.

import { cached, MINUTE } from '../cache.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function liveProjection(actual: number, projected: number, progress: number): number {
  if (progress <= 0) return round2(projected);
  if (progress >= 1) return round2(actual);
  return round2(actual + projected * (1 - progress));
}

interface StatRow {
  player_id: string;
  stats: Record<string, number>;
}

async function fetchProjections(season: string, week: number): Promise<Map<string, Record<string, number>>> {
  const res = await fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`);
  if (!res.ok) throw new Error(`Sleeper projections returned HTTP ${res.status}`);
  const rows = (await res.json()) as StatRow[];
  return new Map(rows.map((r) => [r.player_id, r.stats ?? {}]));
}

// Sleeper's projected stats for every player this week, keyed by Sleeper id.
export const weeklyProjections = (season: string, week: number) =>
  cached(`projections:${season}:${week}`, 10 * MINUTE, () => fetchProjections(season, week));

// Sleeper leagues store scoring as { stat field: points per unit }, including
// 0/1 indicator fields like pts_allow_14_20, so scoring is a weighted sum.
export function scoreWithSettings(stats: Record<string, number>, settings: Record<string, number>): number {
  let total = 0;
  for (const [stat, value] of Object.entries(stats)) total += value * (settings[stat] ?? 0);
  return round2(total);
}
