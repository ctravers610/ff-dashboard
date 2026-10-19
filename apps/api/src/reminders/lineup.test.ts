import type { LeagueSummary, LineupAlert, Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { GameScore } from '../scoring/games.js';
import { dueLineupIssues, lineupIssues, lineupMessage } from './lineup.js';

const game = (kickoff: string): GameScore => ({ opponent: 'X', opponentScore: 0, started: false, progress: 0, kickoff });
// Week 7, 2026: Thursday night 8:15 PM ET, Sunday 1:00 PM and 4:25 PM ET.
const games = new Map([
  ['DEN', game('2026-10-23T00:15:00Z')], // Thu 8:15 PM EDT
  ['SF', game('2026-10-25T17:00:00Z')], // Sun 1:00 PM
  ['KC', game('2026-10-25T20:25:00Z')], // Sun 4:25 PM
]);

const p = (name: string, nflTeam: string): Player => ({ playerId: name, name, position: 'WR', nflTeam, injuryStatus: null });
const alert = (over: Partial<LineupAlert>): LineupAlert => ({ slot: 'WR', playerId: null, playerName: null, reason: 'injury', detail: 'Out', ...over });
const league = (name: string, alerts: LineupAlert[], roster: Player[]): LeagueSummary => ({
  leagueId: name,
  platform: 'sleeper',
  account: 'me',
  name,
  season: '2026',
  week: 7,
  myTeamId: '1',
  standings: [],
  matchup: null,
  alerts,
  roster: roster.map((player) => ({ player, status: 'starter' as const })),
});

const evans = p('Mike Evans', 'SF');
const swap = { playerName: 'Brian Thomas', position: 'WR', projected: 12 };

describe('lineupIssues', () => {
  it('times an injured starter 90 minutes before his own game', () => {
    const [issue] = lineupIssues([league('L', [alert({ playerId: 'Mike Evans', playerName: 'Mike Evans', detail: 'Out' })], [evans])], games, '2026', 7);
    expect(issue!.remindAt.toISOString()).toBe('2026-10-25T15:30:00.000Z'); // Sun 11:30 AM EDT
    expect(issue!.deadline.toISOString()).toBe('2026-10-25T17:00:00.000Z');
  });

  it('times a bye or an empty slot before the week’s first game, fixable until its last', () => {
    const issues = lineupIssues(
      [league('L', [alert({ playerId: 'Bye Guy', playerName: 'Bye Guy', reason: 'bye', detail: 'On bye' }), alert({ reason: 'empty', detail: 'Empty WR slot' })], [p('Bye Guy', 'BUF')])],
      games,
      '2026',
      7,
    );
    for (const i of issues) {
      expect(i.remindAt.toISOString()).toBe('2026-10-22T22:45:00.000Z'); // Thu 6:45 PM EDT
      expect(i.deadline.toISOString()).toBe('2026-10-25T20:25:00.000Z');
    }
  });

  it('counts a Questionable starter only when there’s a healthy swap', () => {
    const q = (suggestion: LineupAlert['suggestion']) =>
      lineupIssues([league('L', [alert({ playerId: 'Mike Evans', playerName: 'Mike Evans', detail: 'Questionable', suggestion })], [evans])], games, '2026', 7);
    expect(q(null)).toEqual([]);
    expect(q(swap)).toHaveLength(1);
  });
});

describe('dueLineupIssues', () => {
  const issues = lineupIssues([league('L', [alert({ playerId: 'Mike Evans', playerName: 'Mike Evans', detail: 'Out' })], [evans])], games, '2026', 7);
  it('is due from the reminder time until kickoff, once', () => {
    expect(dueLineupIssues(issues, new Set(), new Date('2026-10-25T15:00:00Z'))).toEqual([]); // 11 AM: too early
    expect(dueLineupIssues(issues, new Set(), new Date('2026-10-25T15:45:00Z'))).toHaveLength(1);
    expect(dueLineupIssues(issues, new Set([issues[0]!.key]), new Date('2026-10-25T15:45:00Z'))).toEqual([]); // already sent
    expect(dueLineupIssues(issues, new Set(), new Date('2026-10-25T17:05:00Z'))).toEqual([]); // locked
  });
});

describe('lineupMessage', () => {
  it('lists each problem with its league and the suggested swap', () => {
    const issues = lineupIssues(
      [
        league('Massholes', [alert({ playerId: 'Justin Herbert', playerName: 'Justin Herbert', slot: 'QB', reason: 'bye', detail: 'On bye' })], [p('Justin Herbert', 'LAC')]),
        league('Club 223', [alert({ playerId: 'Mike Evans', playerName: 'Mike Evans', detail: 'Questionable', suggestion: swap })], [evans]),
      ],
      games,
      '2026',
      7,
    );
    expect(lineupMessage(issues)).toEqual({
      title: 'Lineup check: 2 starters to fix',
      body: 'Club 223: Mike Evans is Questionable: start Brian Thomas?\nMassholes: Justin Herbert is on bye',
      url: '/?view=matchups',
      tag: 'lineup',
    });
  });
});
