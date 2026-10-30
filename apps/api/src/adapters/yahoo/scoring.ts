// A Yahoo league's scoring, rewritten as Sleeper-style settings ({ Sleeper stat
// field: points per unit }), so Sleeper's projections can be scored the way
// that league scores. Yardage bonuses aren't carried over.

import { flat, items } from './parse.js';

type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Yahoo NFL stat ids (game/nfl/stat_categories) and the Sleeper fields they count.
const SLEEPER_FIELDS: Record<number, string[]> = {
  1: ['pass_att'],
  2: ['pass_cmp'],
  3: ['pass_inc'],
  4: ['pass_yd'],
  5: ['pass_td'],
  6: ['pass_int'],
  7: ['pass_sack'],
  8: ['rush_att'],
  9: ['rush_yd'],
  10: ['rush_td'],
  11: ['rec'],
  12: ['rec_yd'],
  13: ['rec_td'],
  14: ['kr_yd', 'pr_yd'],
  15: ['kr_td', 'pr_td'],
  16: ['pass_2pt', 'rush_2pt', 'rec_2pt'],
  17: ['fum'],
  18: ['fum_lost'],
  19: ['fgm_0_19'],
  20: ['fgm_20_29'],
  21: ['fgm_30_39'],
  22: ['fgm_40_49'],
  23: ['fgm_50p'],
  24: ['fgmiss_0_19'],
  25: ['fgmiss_20_29'],
  26: ['fgmiss_30_39'],
  27: ['fgmiss_40_49'],
  28: ['fgmiss_50p'],
  29: ['xpm'],
  30: ['xpmiss'],
  32: ['sack'],
  33: ['int'],
  34: ['fum_rec'],
  35: ['def_td'],
  36: ['safe'],
  37: ['blk_kick'],
  49: ['def_st_td'],
  50: ['pts_allow_0'],
  51: ['pts_allow_1_6'],
  52: ['pts_allow_7_13'],
  53: ['pts_allow_14_20'],
  54: ['pts_allow_21_27'],
  55: ['pts_allow_28_34'],
  56: ['pts_allow_35p'],
  57: ['fum_rec_td'],
  78: ['rec_tgt'],
  82: ['def_2pt'],
  84: ['fgm_yds'],
};

/** The league's scoring from its settings (league/{key};out=settings), keyed by Sleeper stat field. */
export function yahooScoring(json: Json): Record<string, number> {
  const content = isObject(json) ? json.fantasy_content : null;
  const settings = flat(flat(isObject(content) ? content.league : null).settings);
  const modifiers = isObject(settings.stat_modifiers) ? settings.stat_modifiers.stats : null;
  const list = Array.isArray(modifiers) ? modifiers.map((m) => (isObject(m) ? m.stat : undefined)) : items(modifiers, 'stat');
  const out: Record<string, number> = {};
  for (const stat of list) {
    if (!isObject(stat)) continue;
    const value = Number(stat.value);
    for (const field of SLEEPER_FIELDS[Number(stat.stat_id)] ?? []) if (Number.isFinite(value)) out[field] = value;
  }
  return out;
}
