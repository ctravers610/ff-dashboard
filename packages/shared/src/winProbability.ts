// How likely you are to win a matchup, from the live projections: the expected
// final margin, and how much it could still move. The more projected points
// still to be scored, the more uncertain the result: a full week's swing is
// about ±25 points either way, shrinking to nothing as the games finish.

import type { Matchup } from './index';

// Typical spread of the final margin with the whole week to play (one standard
// deviation). Week-to-week fantasy scores vary by roughly 18 points per team,
// so the difference between two teams by about √2 × 18 ≈ 25.
const FULL_WEEK_SD = 25;
// Projected points two teams typically score in a week, the "whole week to play" scale.
const FULL_WEEK_POINTS = 220;

// Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26, error < 1e-7).
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Chance the side ahead by `margin` (projected, final) stays ahead, with
 * `pointsLeft` projected points still to be scored by both teams together.
 */
export function chanceToWin(margin: number, pointsLeft: number): number {
  const sd = FULL_WEEK_SD * Math.sqrt(Math.max(0, pointsLeft) / FULL_WEEK_POINTS);
  if (sd < 0.01) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return normalCdf(margin / sd);
}

/** Your chance of winning this week's matchup (0–1), or null if there's nothing to judge. */
export function winProbability(m: Matchup | null): number | null {
  if (!m) return null;
  if (m.allPlay) {
    // All-play: you win by finishing inside the top N. Compare your projection
    // with the projected score of the team at the edge of the win line.
    const { teams, winSlots } = m.allPlay;
    const me = teams.find((t) => t.isMe);
    const others = teams.filter((t) => !t.isMe).map((t) => t.projected ?? t.points).sort((a, b) => b - a);
    const line = others[winSlots - 1]; // you need to beat the Nth-best of the others
    if (!me || line == null) return null;
    const mine = me.projected ?? me.points;
    return chanceToWin(mine - line, Math.max(0, mine - me.points) * 2);
  }
  if (!m.opponent) return null;
  const me = m.me.projected ?? m.me.points;
  const them = m.opponent.projected ?? m.opponent.points;
  const left = Math.max(0, me - m.me.points) + Math.max(0, them - m.opponent.points);
  return chanceToWin(me - them, left);
}
