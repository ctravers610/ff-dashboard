import { FFPC_FAAB_LEFT, ffpcWaiverPage } from '@ffd/demo/fixtures/waivers';
import type { ManualLeague } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { buildPlayerIndex } from '../adapters/manual/parse.js';
import type { SleeperPlayerMap } from '../adapters/sleeper/types.js';
import type { ManualFaabClaimRow } from '../db/schema.js';
import { ffpcWaiverLeague } from './ffpc.js';

const league: ManualLeague = { id: 'league-1', platform: 'ffpc', name: 'Tourney #1', teamName: 'Club', rosterText: 'WR Chris Olave', updatedAt: '2026-10-01T00:00:00Z', waiversCapturedAt: null };
const ctx = { season: '2026', week: 8, lastWeek: 17, byeTeams: null, trendingAdds: new Map<string, number>() };
const players = {
  '1': { player_id: '1', name: 'Chris Bell', position: 'WR', team: 'MIA' },
  '2': { player_id: '2', name: 'Chris Olave', position: 'WR', team: 'NO' },
  '3': { player_id: '3', name: "Ja'Kobi Lane", position: 'TE', team: 'BAL' },
} as unknown as SleeperPlayerMap;
const index = buildPlayerIndex(players);
const claim = (over: Partial<ManualFaabClaimRow>): ManualFaabClaimRow => ({
  leagueId: league.id, season: '2026', runOn: '2026-09-09', week: 1, player: 'Chris Bell', position: 'WR', nflTeam: 'MIA', team: 'Team D', bid: 185, losers: [11, 75], capturedAt: new Date(), ...over,
});
const paste = { text: ffpcWaiverPage(), capturedAt: new Date('2026-10-29T15:00:00Z') };

describe('ffpcWaiverLeague', () => {
  it('knows the budget, what rivals have left and your lineup, which price a bid', () => {
    const l = ffpcWaiverLeague(league, paste, index, [new Map()], ctx);
    expect(l.rules).toMatchObject({ type: 'faab', faabLeft: FFPC_FAAB_LEFT, faabTotal: 1000 });
    expect(l.rivalBalances!.length).toBe((l.rules as { teams: number }).teams - 1);
    expect(l.lineup!.starters.map((s) => s.player?.player.name)).toEqual(['Chris Olave']);
  });

  it("turns the league's pasted claims into winning bids, with what they beat", () => {
    const l = ffpcWaiverLeague(league, paste, index, [new Map()], ctx, [claim({})]);
    expect(l.winningBids).toEqual([{ player: expect.objectContaining({ playerId: '1' }), bid: 185, week: 1, losers: [11, 75] }]);
    expect(l.bids).toMatchObject({ count: 1, median: 185, high: 185 });
  });

  it('matches a player FFPC lists at another position, and keeps claims without an add/drop paste', () => {
    const l = ffpcWaiverLeague(league, null, index, [new Map()], ctx, [claim({ player: "Ja'Kobi Lane", nflTeam: 'BAL' })]);
    expect(l.rules).toBeNull();
    expect(l.winningBids![0]!.player).toMatchObject({ playerId: '3', position: 'TE' });
  });
});
