import { describe, expect, it } from 'vitest';
import { FFPC_RULES } from './rules.js';
import { scoreStats } from './score.js';

// Raw Sleeper stats from week 6 of 2026, with FFPC's official points for each.
describe('FFPC scoring', () => {
  it('scores a QB: 0.05/pass yd, 4/pass TD, 0.1/rush yd (Drake Maye = 26.15)', () => {
    expect(scoreStats({ pass_yd: 235, pass_td: 3, rush_yd: 24 }, 'QB', FFPC_RULES)).toBe(26.15);
  });

  it('scores a WR with 1 PPR (Malik Nabers = 28.5)', () => {
    expect(scoreStats({ rec: 12, rec_yd: 165 }, 'WR', FFPC_RULES)).toBe(28.5);
  });

  it('applies the 1.5 TE premium and 2-point conversions (Isaiah Likely = 26.9)', () => {
    expect(scoreStats({ rec: 6, rec_yd: 99, rec_td: 1, rec_2pt: 1 }, 'TE', FFPC_RULES)).toBe(26.9);
  });

  it('scores kickers 3 per FG plus 0.1 per yard over 30, 1 per PAT (Spencer Shrader = 9.7)', () => {
    expect(scoreStats({ fgm: 2, fgm_yds_over_30: 17, xpm: 2 }, 'K', FFPC_RULES)).toBe(9.7);
  });

  it('scores defenses on sacks, turnovers and points allowed (SEA = 5, NE = 8)', () => {
    expect(scoreStats({ sack: 2 }, 'DEF', FFPC_RULES, 17)).toBe(5);
    expect(scoreStats({ sack: 3, int: 1 }, 'DEF', FFPC_RULES, 19)).toBe(8);
  });

  it('uses every points-allowed tier from the official rules', () => {
    const tiers = [0, 1, 6, 7, 13, 14, 19, 20, 23, 24, 29, 30, 45].map((pa) => scoreStats({}, 'DEF', FFPC_RULES, pa));
    expect(tiers).toEqual([12, 8, 8, 5, 5, 3, 3, 1, 1, 0, 0, -2, -2]);
  });

  it('scores blocked kicks, safeties and defensive TDs', () => {
    expect(scoreStats({ blk_kick: 1, safe: 1, def_td: 1, fum_rec: 1 }, 'DEF', FFPC_RULES, 24)).toBe(15);
  });

  it("doesn't award shutout points to a defense whose game hasn't started", () => {
    expect(scoreStats({}, 'DEF', FFPC_RULES, null)).toBe(0);
    expect(scoreStats({}, 'DEF', FFPC_RULES, 0)).toBe(12);
  });

  it('estimates kicker yardage from distance bands for projections', () => {
    // Projections have no fgm_yds_over_30: 1 make in 30-39 (~5 yds over) + 1 in 50+ (~22).
    expect(scoreStats({ fgm: 2, fgm_30_39: 1, fgm_50p: 1, xpm: 3 }, 'K', FFPC_RULES)).toBe(11.7);
  });

  it('ignores stats that are not in the rules', () => {
    expect(scoreStats({ rec: 1, targets: 10, anytime_tds: 3 }, 'WR', FFPC_RULES)).toBe(1);
  });
});
