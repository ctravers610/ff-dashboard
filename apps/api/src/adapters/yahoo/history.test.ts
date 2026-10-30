import type { LeagueSummary } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { pastWeekSnapshots } from './history.js';
import type { YahooMatchup } from './parse.js';

const summary = { leagueId: '461.l.777001', name: 'Made-Up Yahoo League', season: '2026', myTeamId: '461.l.777001.t.4' } as LeagueSummary;
const side = (teamKey: string, teamName: string, points: number) => ({ teamKey, teamName, points, projected: null });
const week = (n: number, status: string, mine: number, theirs: number): YahooMatchup => ({
  week: n,
  status,
  me: side(summary.myTeamId, 'Placeholder Punters', mine),
  opponent: side('461.l.777001.t.9', `Opponent ${n}`, theirs),
});

describe('Yahoo past weeks', () => {
  it('keeps finished weeks that were asked for, rounded', () => {
    const rows = pastWeekSnapshots([week(1, 'postevent', 101.234, 99.5), week(2, 'postevent', 88, 120.111), week(3, 'midevent', 40, 30)], summary, [2, 3]);
    expect(rows).toEqual([
      { platform: 'yahoo', leagueId: summary.leagueId, leagueName: summary.name, season: '2026', week: 2, points: 88, opponentName: 'Opponent 2', opponentPoints: 120.11 },
    ]);
  });
});
