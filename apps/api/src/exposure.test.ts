import type { LeagueSummary, Player, RosterStatus } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { buildExposure, playerKey } from './exposure.js';

const player = (name: string, position: string, nflTeam: string, extra: Partial<Player> = {}): Player => ({
  playerId: name,
  name,
  position,
  nflTeam,
  injuryStatus: null,
  ...extra,
});

const league = (
  leagueId: string,
  platform: LeagueSummary['platform'],
  roster: [Player, RosterStatus][],
  opponentStarters: Player[] = [],
): LeagueSummary => ({
  leagueId,
  platform,
  account: 'me',
  name: `League ${leagueId}`,
  season: '2026',
  week: 6,
  myTeamId: '1',
  standings: [],
  alerts: [],
  roster: roster.map(([p, status]) => ({ player: p, status })),
  matchup: {
    week: 6,
    me: { teamId: '1', teamName: 'Me', points: 0, starters: [] },
    opponent: {
      teamId: '2',
      teamName: 'Them',
      points: 0,
      starters: opponentStarters.map((p) => ({ slot: p.position, player: p, points: 0 })),
    },
  },
});

describe('playerKey', () => {
  it('matches the same player across platforms despite punctuation and suffixes', () => {
    expect(playerKey(player('A.J. Brown', 'WR', 'PHI'))).toBe(playerKey(player('AJ Brown', 'WR', 'PHI')));
    expect(playerKey(player('Marvin Harrison Jr.', 'WR', 'ARI'))).toBe('WR:marvinharrison');
    expect(playerKey(player("D'Andre Swift", 'RB', 'CHI'))).toBe('RB:dandreswift');
  });

  it('keys team defenses by NFL team, since platforms name them differently', () => {
    expect(playerKey(player('San Francisco 49ers', 'DEF', 'SF'))).toBe(playerKey(player('49ers D/ST', 'DEF', 'SF')));
  });

  it('keeps different positions apart', () => {
    expect(playerKey(player('Josh Allen', 'QB', 'BUF'))).not.toBe(playerKey(player('Josh Allen', 'LB', 'JAX')));
  });
});

describe('buildExposure', () => {
  const waddleSleeper = player('Jaylen Waddle', 'WR', 'DEN');
  const waddleEspn = player('Jaylen Waddle', 'WR', 'DEN', { playerId: '4372016', injuryStatus: 'Questionable' });
  const evans = player('Mike Evans', 'WR', 'SF');
  const bowers = player('Brock Bowers', 'TE', 'LV');

  const leagues = [
    league('S1', 'sleeper', [[waddleSleeper, 'bench'], [evans, 'starter']], [bowers]),
    league('E1', 'espn', [[waddleEspn, 'starter'], [bowers, 'starter']], [evans]),
  ];

  it('merges the same player owned on different platforms', () => {
    const waddle = buildExposure(leagues).find((e) => e.player.name === 'Jaylen Waddle')!;
    expect(waddle.owned.map((o) => [o.leagueId, o.status])).toEqual([
      ['E1', 'starter'],
      ['S1', 'bench'],
    ]);
    expect(waddle.player.injuryStatus).toBe('Questionable');
  });

  it('records players your opponents are starting against you', () => {
    const exposure = buildExposure(leagues);
    const bowersExp = exposure.find((e) => e.player.name === 'Brock Bowers')!;
    expect(bowersExp.owned.map((o) => o.leagueId)).toEqual(['E1']);
    expect(bowersExp.facing.map((f) => f.leagueId)).toEqual(['S1']);
  });

  it('sorts most-owned players first', () => {
    expect(buildExposure(leagues)[0]!.player.name).toBe('Jaylen Waddle');
  });
});
