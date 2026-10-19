import type { ManualLeague } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { SleeperPlayerMap } from '../sleeper/types.js';
import { toManualSummary } from './index.js';
import { buildPlayerIndex } from './parse.js';

const players: SleeperPlayerMap = {
  '1': { name: 'Drake Maye', position: 'QB', team: 'NE', injury_status: null },
  '2': { name: 'Brock Purdy', position: 'QB', team: 'SF', injury_status: null },
  '3': { name: 'Mike Evans', position: 'WR', team: 'SF', injury_status: 'Questionable' },
  SEA: { name: 'Seattle Seahawks', position: 'DEF', team: 'SEA', injury_status: null },
};
const index = buildPlayerIndex(players);

const league = (week: number): ManualLeague => ({
  id: 'L1',
  platform: 'ffpc',
  name: 'Test',
  teamName: 'Sample Squad',
  rosterText: 'QB Drake Maye\nBN Mike Evans',
  updatedAt: '2026-10-18T00:00:00Z',
  matchup: {
    week,
    capturedAt: '2026-10-19T20:00:00Z',
    me: {
      teamName: 'Sample Squad',
      points: 31.15,
      starters: [
        { slot: 'QB', name: 'Drake Maye', points: 26.15 },
        { slot: 'DEF', name: 'SEA DST', points: 5 },
      ],
    },
    opponent: { teamName: 'Rival', points: 20, starters: [{ slot: 'QB', name: 'Brock Purdy', points: 20 }] },
  },
});

describe('toManualSummary', () => {
  it('turns a pasted matchup for the current week into a resolved matchup', () => {
    const summary = toManualSummary(league(6), index, { season: '2026', week: 6 });
    expect(summary.matchup?.me.starters.map((s) => [s.slot, s.player?.name, s.points])).toEqual([
      ['QB', 'Drake Maye', 26.15],
      ['DEF', 'Seattle Seahawks', 5],
    ]);
    expect(summary.matchup?.opponent).toMatchObject({ teamName: 'Rival', points: 20 });
    expect(summary.manual?.matchupCapturedAt).toBe('2026-10-19T20:00:00Z');
  });

  it("hides last week's matchup once the NFL week moves on", () => {
    const summary = toManualSummary(league(5), index, { season: '2026', week: 6 });
    expect(summary.matchup).toBeNull();
    expect(summary.manual?.matchupCapturedAt).toBeNull();
  });

  it('replaces snapshot points with live ones when a scorer is available', () => {
    const live = { 'Drake Maye': 30, 'Seattle Seahawks': 7, 'Brock Purdy': 12.5 } as Record<string, number>;
    const summary = toManualSummary(league(6), index, { season: '2026', week: 6 }, (p) => live[p.name] ?? 0);
    expect(summary.matchup?.me.starters.map((s) => s.points)).toEqual([30, 7]);
    expect(summary.matchup?.me.points).toBe(37);
    expect(summary.matchup?.opponent?.points).toBe(12.5);
    expect(summary.manual?.liveScored).toBe(true);
  });

  it('still builds the roster and alerts without a matchup', () => {
    const summary = toManualSummary({ ...league(6), matchup: null }, index, { season: '2026', week: 6 });
    expect(summary.roster.map((r) => [r.player.name, r.status])).toEqual([
      ['Drake Maye', 'starter'],
      ['Mike Evans', 'bench'],
    ]);
  });
});
