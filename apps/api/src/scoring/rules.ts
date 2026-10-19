// Scoring rules as data, keyed by Sleeper stat field names, so the same engine
// can score any league once its rules are written down here.

export interface ScoringRules {
  stats: Record<string, number>; // points per unit of each stat
  positionStats?: Record<string, Record<string, number>>; // per-position overrides
  kicking: { fgMade: number; perYardOver30: number; xpMade: number };
  defense: {
    stats: Record<string, number>;
    // First tier whose `max` is >= points allowed applies.
    pointsAllowed: { max: number; points: number }[];
  };
}

// FFPC scoring, from https://myffpc.com/cms/public/play/big-gorilla-official-rules.
// Verified to reproduce FFPC's official week-6 player totals; see score.test.ts.
export const FFPC_RULES: ScoringRules = {
  stats: {
    pass_yd: 0.05,
    pass_td: 4,
    pass_int: -1,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    pr_td: 6, // FFPC "action" scoring: any TD a player scores counts
    kr_td: 6,
    pass_2pt: 2,
    rush_2pt: 2,
    rec_2pt: 2,
    fum_lost: -1,
  },
  positionStats: { TE: { rec: 1.5 } }, // TE premium
  kicking: { fgMade: 3, perYardOver30: 0.1, xpMade: 1 },
  defense: {
    stats: { sack: 1, int: 2, fum_rec: 2, safe: 5, blk_kick: 2, def_td: 6, def_st_td: 6 },
    pointsAllowed: [
      { max: 0, points: 12 }, // shutout
      { max: 6, points: 8 },
      { max: 13, points: 5 },
      { max: 19, points: 3 },
      { max: 23, points: 1 },
      { max: 29, points: 0 },
      { max: Infinity, points: -2 },
    ],
  },
};
