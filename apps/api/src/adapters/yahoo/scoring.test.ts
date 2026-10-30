import { describe, expect, it } from 'vitest';
import { scoreWithSettings } from '../../scoring/projection.js';
import { yahooScoring } from './scoring.js';

// A made-up league's settings, in Yahoo's shape: stat ids and their values.
const settings = (mods: [number, string][]) => ({
  fantasy_content: { league: [{ league_key: '461.l.777001' }, { settings: [{ stat_modifiers: { stats: mods.map(([stat_id, value]) => ({ stat: { stat_id, value } })) } }] }] },
});

describe("a Yahoo league's scoring as Sleeper settings", () => {
  const scoring = yahooScoring(
    settings([
      [4, '0.04'], [5, '4'], [6, '-2'], [11, '0.5'], [12, '0.1'], [13, '6'],
      [16, '2'], [33, '2'], [53, '1'], [84, '0.1'], [999, '5'],
    ]),
  );

  it('maps each stat to the Sleeper field it counts', () => {
    expect(scoring).toMatchObject({ pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 0.5, rec_yd: 0.1, rec_td: 6, int: 2, pts_allow_14_20: 1, fgm_yds: 0.1 });
    expect([scoring.pass_2pt, scoring.rush_2pt, scoring.rec_2pt]).toEqual([2, 2, 2]); // one Yahoo stat, three Sleeper fields
  });

  it('skips stats it has no Sleeper field for', () => {
    expect(Object.values(scoring)).not.toContain(5);
  });

  it('scores a projection the way the league would', () => {
    // 6 catches, 80 yards, a touchdown at half PPR.
    expect(scoreWithSettings({ rec: 6, rec_yd: 80, rec_td: 1 }, scoring)).toBe(17);
  });

  it('copes with settings it can’t read', () => {
    expect(yahooScoring({})).toEqual({});
  });
});
