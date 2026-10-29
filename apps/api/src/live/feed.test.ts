import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { scoreWithSettings } from '../scoring/projection.js';
import { FFPC_RULES } from '../scoring/rules.js';
import { scoreStats } from '../scoring/score.js';
import { describeChange, diffSnapshots, type Snapshot, type TrackedPlayer } from './feed.js';

const snap = (stats: Record<string, Record<string, number>>, espn: Record<string, number> = {}): Snapshot => ({
  stats: new Map(Object.entries(stats)),
  games: new Map(),
  platformPoints: new Map(Object.entries(espn)),
});

const te: Player = { playerId: '9487', name: 'Brock Bowers', position: 'TE', nflTeam: 'LV', injuryStatus: null };
const ppr = { rec: 1, rec_yd: 0.1, rec_td: 6 };

// Bowers in three leagues: a PPR Sleeper league, FFPC (1.5 per TE catch), and ESPN (its own totals).
const bowers: TrackedPlayer = {
  sleeperId: '9487',
  player: te,
  appearances: [
    { leagueKey: 'sleeper:1', leagueName: 'Sleeper League', platform: 'sleeper', role: 'starter', pointsFor: (s) => scoreWithSettings(s.stats.get('9487') ?? {}, ppr) },
    { leagueKey: 'ffpc:2', leagueName: 'Club 223', platform: 'ffpc', role: 'bench', pointsFor: (s) => scoreStats(s.stats.get('9487') ?? {}, 'TE', FFPC_RULES) },
    { leagueKey: 'espn:3', leagueName: 'Massholes', platform: 'espn', role: 'opponent', pointsFor: (s) => s.platformPoints.get('3:espn-bowers') ?? null },
  ],
};

describe('describeChange', () => {
  it('reads like a box score line', () => {
    expect(describeChange({ rec: 3, rec_yd: 40 }, { rec: 4, rec_yd: 54 })).toBe('1 catch, 14 rec yds');
    expect(describeChange({}, { rec: 2, rec_yd: 31, rec_td: 1 })).toBe('2 catches, 1 rec TD, 31 rec yds');
    expect(describeChange({ pass_yd: 100 }, { pass_yd: 99 })).toBe('−1 pass yd'); // a stat correction
    expect(describeChange({ rec_tgt: 3 }, { rec_tgt: 4 })).toBe(''); // targets don't score
  });
});

describe('diffSnapshots', () => {
  it('turns a catch into one event, worth each league’s own points', () => {
    const before = snap({ 9487: { rec: 3, rec_yd: 40 } }, { '3:espn-bowers': 7 });
    const after = snap({ 9487: { rec: 4, rec_yd: 54 } }, { '3:espn-bowers': 9.4 });
    const [event] = diffSnapshots(before, after, [bowers]);
    expect(event).toMatchObject({ description: '1 catch, 14 rec yds' });
    expect(event!.leagues.map((l) => [l.leagueName, l.role, l.points])).toEqual([
      ['Sleeper League', 'starter', 2.4], // 1 + 1.4
      ['Club 223', 'bench', 2.9], // 1.5 (TE premium) + 1.4
      ['Massholes', 'opponent', 2.4], // ESPN's own total moved 7 → 9.4
    ]);
  });

  it('marks ESPN as catching up when stats moved but ESPN’s total hasn’t yet', () => {
    const before = snap({ 9487: { rec: 3 } }, { '3:espn-bowers': 7 });
    const after = snap({ 9487: { rec: 4 } }, { '3:espn-bowers': 7 });
    expect(diffSnapshots(before, after, [bowers])[0]!.leagues.find((l) => l.platform === 'espn')!.points).toBeNull();
  });

  it('reports ESPN catching up later as a scoring update', () => {
    const before = snap({ 9487: { rec: 4 } }, { '3:espn-bowers': 7 });
    const after = snap({ 9487: { rec: 4 } }, { '3:espn-bowers': 8 });
    const [event] = diffSnapshots(before, after, [bowers]);
    expect(event).toMatchObject({ description: 'scoring update' });
    expect(event!.leagues.find((l) => l.platform === 'espn')!.points).toBe(1);
  });

  it('stays quiet when nothing that scores has changed', () => {
    const same = snap({ 9487: { rec: 4, rec_tgt: 6 } }, { '3:espn-bowers': 7 });
    const more = snap({ 9487: { rec: 4, rec_tgt: 7 } }, { '3:espn-bowers': 7 });
    expect(diffSnapshots(same, more, [bowers])).toEqual([]);
  });
});
