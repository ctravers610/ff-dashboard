import type { ScoringRules } from './rules.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

const sumRules = (stats: Record<string, number>, rules: Record<string, number>) =>
  Object.entries(rules).reduce((total, [stat, pts]) => total + (stats[stat] ?? 0) * pts, 0);

/**
 * Fantasy points for one player's raw stats.
 * @param pointsAllowed for defenses: points their opponent has scored, or null
 *   before kickoff (so an unplayed game isn't scored as a shutout).
 */
export function scoreStats(
  stats: Record<string, number>,
  position: string,
  rules: ScoringRules,
  pointsAllowed: number | null = null,
): number {
  if (position === 'K') {
    const { fgMade, perYardOver30, xpMade } = rules.kicking;
    return round2((stats.fgm ?? 0) * fgMade + (stats.fgm_yds_over_30 ?? 0) * perYardOver30 + (stats.xpm ?? 0) * xpMade);
  }
  if (position === 'DEF') {
    const tier = pointsAllowed == null ? 0 : (rules.defense.pointsAllowed.find((t) => pointsAllowed <= t.max)?.points ?? 0);
    return round2(sumRules(stats, rules.defense.stats) + tier);
  }
  const statRules = { ...rules.stats, ...rules.positionStats?.[position] };
  return round2(sumRules(stats, statRules));
}
