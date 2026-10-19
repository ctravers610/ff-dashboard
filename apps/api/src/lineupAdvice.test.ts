import type { InjuryStatus, LeagueSummary, LineupAlert, Player, RosterStatus } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { adviseLeague, canPlay, type AdviceContext } from './lineupAdvice.js';
import type { GameScore } from './scoring/games.js';

const player = (name: string, position: string, nflTeam: string, injuryStatus: InjuryStatus = null): Player => ({
  playerId: name,
  name,
  position,
  nflTeam,
  injuryStatus,
});

const league = (roster: [Player, RosterStatus][], alerts: LineupAlert[]): LeagueSummary => ({
  leagueId: 'L1',
  platform: 'sleeper',
  account: 'me',
  name: 'League',
  season: '2026',
  week: 6,
  myTeamId: '1',
  standings: [],
  matchup: null,
  alerts,
  roster: roster.map(([p, status]) => ({ player: p, status })),
});

const injured = (p: Player, slot: string): LineupAlert => ({
  slot,
  playerId: p.playerId,
  playerName: p.name,
  reason: 'injury',
  detail: p.injuryStatus ?? '',
});

const game = (started: boolean): GameScore => ({ opponent: 'X', opponentScore: 0, started, progress: started ? 0.5 : 0, kickoff: null });

// TB and DAL haven't kicked off, MIA is underway, and BUF is on a bye (no game listed).
const ctx = (projections: Record<string, number> = {}): AdviceContext => ({
  games: new Map([
    ['TB', game(false)],
    ['DAL', game(false)],
    ['JAX', game(false)],
    ['MIA', game(true)],
  ]),
  projectedFor: (p) => projections[p.name] ?? null,
});

const evans = player('Mike Evans', 'WR', 'TB', 'Questionable');

describe('canPlay', () => {
  it('knows which positions each slot accepts', () => {
    expect(canPlay('WR', 'WR')).toBe(true);
    expect(canPlay('WR', 'RB')).toBe(false);
    expect(canPlay('FLEX', 'TE')).toBe(true);
    expect(canPlay('FLEX', 'QB')).toBe(false);
    expect(canPlay('SUPER_FLEX', 'QB')).toBe(true);
    expect(canPlay('OP', 'QB')).toBe(true);
    expect(canPlay('D/ST', 'DEF')).toBe(true);
  });
});

describe('adviseLeague', () => {
  it('suggests the healthy bench player with the highest projection who can fill the slot', () => {
    const thomas = player('Brian Thomas', 'WR', 'JAX');
    const pickens = player('George Pickens', 'WR', 'DAL');
    const harris = player('Najee Harris', 'RB', 'DAL'); // can't play WR
    const l = league(
      [[evans, 'starter'], [thomas, 'bench'], [pickens, 'bench'], [harris, 'bench']],
      [injured(evans, 'WR')],
    );
    const [alert] = adviseLeague(l, ctx({ 'Brian Thomas': 14.2, 'George Pickens': 11, 'Najee Harris': 20 }));
    expect(alert?.suggestion).toEqual({ playerName: 'Brian Thomas', position: 'WR', projected: 14.2 });
  });

  it('drops an alert once that player’s game has started: the lineup is locked', () => {
    const waddle = player('Jaylen Waddle', 'WR', 'MIA', 'Questionable');
    const l = league([[waddle, 'starter'], [evans, 'starter']], [injured(waddle, 'WR'), injured(evans, 'WR')]);
    expect(adviseLeague(l, ctx()).map((a) => a.playerName)).toEqual(['Mike Evans']);
  });

  it('never suggests an injured player, one whose game started, or one on a bye', () => {
    const l = league(
      [
        [evans, 'starter'],
        [player('Hurt WR', 'WR', 'DAL', 'Out'), 'bench'],
        [player('Playing WR', 'WR', 'MIA'), 'bench'],
        [player('Bye WR', 'WR', 'BUF'), 'bench'],
        [player('IR WR', 'WR', 'DAL'), 'ir'],
      ],
      [injured(evans, 'WR')],
    );
    expect(adviseLeague(l, ctx())[0]?.suggestion).toBeNull();
  });

  it('suggests a different player for each slot that needs one', () => {
    const godwin = player('Chris Godwin', 'WR', 'TB', 'Doubtful');
    const a = player('Bench A', 'WR', 'DAL');
    const b = player('Bench B', 'WR', 'DAL');
    const l = league(
      [[evans, 'starter'], [godwin, 'starter'], [a, 'bench'], [b, 'bench']],
      [injured(evans, 'WR'), injured(godwin, 'FLEX')],
    );
    const names = adviseLeague(l, ctx({ 'Bench A': 10, 'Bench B': 8 })).map((x) => x.suggestion?.playerName);
    expect(names).toEqual(['Bench A', 'Bench B']);
  });

  it('fills an empty slot too, and still ranks players without a projection', () => {
    const l = league(
      [[player('Some TE', 'TE', 'DAL'), 'bench']],
      [{ slot: 'FLEX', playerId: null, playerName: null, reason: 'empty', detail: 'Empty FLEX slot' }],
    );
    expect(adviseLeague(l, ctx())[0]?.suggestion).toEqual({ playerName: 'Some TE', position: 'TE', projected: null });
  });

  it('keeps every alert, without filtering, when the scoreboard is unavailable', () => {
    const waddle = player('Jaylen Waddle', 'WR', 'MIA', 'Questionable');
    const l = league([[waddle, 'starter']], [injured(waddle, 'WR')]);
    expect(adviseLeague(l, { games: null, projectedFor: () => null })).toHaveLength(1);
  });

  it('flags a starter whose team is on bye, with a swap', () => {
    const onBye = player('Bye Starter', 'WR', 'BUF'); // BUF has no game this week
    const thomas = player('Brian Thomas', 'WR', 'JAX');
    const l = {
      ...league([[onBye, 'starter'], [thomas, 'bench']], []),
      matchup: { week: 6, me: { teamId: '1', teamName: 'Me', points: 0, starters: [{ slot: 'WR', player: onBye, points: 0 }] }, opponent: null },
    };
    expect(adviseLeague(l, ctx())).toEqual([
      expect.objectContaining({ slot: 'WR', playerName: 'Bye Starter', reason: 'bye', detail: 'On bye', suggestion: expect.objectContaining({ playerName: 'Brian Thomas' }) }),
    ]);
  });
});
