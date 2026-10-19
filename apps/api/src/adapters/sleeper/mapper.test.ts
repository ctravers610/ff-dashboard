import { describe, expect, it } from 'vitest';
import { buildStandings, toLeagueSummary, type SleeperLeagueData } from './mapper.js';
import type { SleeperRoster } from './types.js';

const roster = (id: number, owner: string, wins: number, losses: number, fpts: number): SleeperRoster => ({
  roster_id: id,
  owner_id: owner,
  co_owners: null,
  starters: [],
  players: [],
  settings: { wins, losses, ties: 0, fpts, fpts_decimal: 50 },
});

const baseData = (): SleeperLeagueData => ({
  account: 'me',
  myUserId: 'u1',
  week: 6,
  league: {
    league_id: 'L1',
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    total_rosters: 3,
    roster_positions: ['QB', 'RB', 'FLEX', 'BN', 'BN'],
  },
  users: [
    { user_id: 'u1', username: 'me', display_name: 'Me', avatar: null, metadata: { team_name: 'My Team' } },
    { user_id: 'u2', username: 'rival', display_name: 'Rival', avatar: 'abc' },
  ],
  rosters: [
    { ...roster(1, 'u1', 3, 2, 700), starters: ['p1', '0', 'p2'] },
    roster(2, 'u2', 4, 1, 650),
    roster(3, 'u3', 3, 2, 720),
  ],
  matchups: [
    { roster_id: 1, matchup_id: 1, points: 101.5, starters: ['p1', '0', 'p2'], starters_points: [20, 0, 81.5] },
    { roster_id: 2, matchup_id: 1, points: 90, starters: ['p3', 'p3', 'p3'], starters_points: [30, 30, 30] },
    { roster_id: 3, matchup_id: 2, points: 80, starters: [], starters_points: [] },
  ],
  players: {
    p1: { name: 'Quarter Back', position: 'QB', team: 'BUF', injury_status: null },
    p2: { name: 'Hurt Guy', position: 'WR', team: 'MIA', injury_status: 'Out' },
    p3: { name: 'Other Guy', position: 'RB', team: 'NYJ', injury_status: 'Sus' },
  },
});

describe('buildStandings', () => {
  it('ranks by win percentage, then points for', () => {
    const data = baseData();
    const standings = buildStandings(data.rosters, data.users);
    expect(standings.map((t) => t.teamId)).toEqual(['2', '3', '1']);
    expect(standings[2]).toMatchObject({ teamName: 'My Team', pointsFor: 700.5, rank: 3 });
  });

  it('falls back to display name and a placeholder for unclaimed teams', () => {
    const data = baseData();
    const standings = buildStandings(data.rosters, data.users);
    expect(standings.find((t) => t.teamId === '2')?.teamName).toBe('Rival');
    expect(standings.find((t) => t.teamId === '3')?.ownerName).toBe('Unclaimed');
  });
});

describe('toLeagueSummary', () => {
  it('pairs my matchup with the opponent sharing the matchup_id', () => {
    const summary = toLeagueSummary(baseData())!;
    expect(summary.matchup?.me.points).toBe(101.5);
    expect(summary.matchup?.opponent?.teamName).toBe('Rival');
    expect(summary.matchup?.me.starters.map((s) => s.slot)).toEqual(['QB', 'RB', 'FLEX']);
    expect(summary.matchup?.opponent?.starters[0]?.player?.injuryStatus).toBe('Suspended');
  });

  it('flags empty slots and injured starters', () => {
    const summary = toLeagueSummary(baseData())!;
    expect(summary.alerts).toEqual([
      { slot: 'RB', playerName: null, reason: 'empty', detail: 'Empty RB slot' },
      { slot: 'FLEX', playerName: 'Hurt Guy', reason: 'injury', detail: 'Out' },
    ]);
  });

  it('adds live projections for each starter and the team when a projector is given', () => {
    const summary = toLeagueSummary({ ...baseData(), project: (_p, actual) => actual + 10 })!;
    expect(summary.matchup?.me.starters.map((s) => s.projected)).toEqual([30, 0, 91.5]);
    expect(summary.matchup?.me.projected).toBe(121.5);
    expect(toLeagueSummary(baseData())!.matchup?.me.projected).toBeNull();
  });

  it('returns null when the account has no team in the league', () => {
    expect(toLeagueSummary({ ...baseData(), myUserId: 'nobody' })).toBeNull();
  });
});
