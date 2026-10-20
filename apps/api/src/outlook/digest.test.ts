import { describe, expect, it } from 'vitest';
import { luckTable, seasonAwards, type PlayedGame } from './digest.js';

const teams = ['A', 'B', 'C', 'D'].map((t) => ({ teamId: t, name: `Team ${t}` }));

// Two weeks. A scores the most both weeks but drew B, who scored second most in
// week 1; C scores little but always faced the worst team.
const games: PlayedGame[] = [
  { week: 1, a: 'A', b: 'B', pa: 150, pb: 140 },
  { week: 1, a: 'C', b: 'D', pa: 90, pb: 80 },
  { week: 2, a: 'A', b: 'C', pa: 130, pb: 70 },
  { week: 2, a: 'B', b: 'D', pa: 100, pb: 101 },
];

describe('luckTable', () => {
  const luck = luckTable(teams, games, 'C');
  const row = (t: string) => luck.find((r) => r.teamName === `Team ${t}`)!;

  it('counts the real record and the all-play record from the games', () => {
    expect(row('A')).toMatchObject({ wins: 2, losses: 0, allPlayWins: 6, allPlayLosses: 0, expectedWins: 2, pointsFor: 280, pointsAgainst: 210 });
    expect(row('B')).toMatchObject({ wins: 0, losses: 2, allPlayWins: 3, allPlayLosses: 3, expectedWins: 1 }); // 2nd, then 3rd
    expect(row('C')).toMatchObject({ wins: 1, losses: 1, allPlayWins: 1, expectedWins: 0.3, isMe: true });
  });

  it('puts the luckiest first: wins beyond what the scoring earned', () => {
    expect(luck[0]!.teamName).toBe('Team C'); // 1 win from a third of one earned
    expect(row('B').luck).toBe(-1);
    expect(luck.at(-1)!.teamName).toBe('Team B');
  });
});

describe('seasonAwards', () => {
  it('hands out the superlatives', () => {
    const luck = luckTable(teams, games, 'C');
    const awards = seasonAwards(teams, games, luck, 'C', {
      benchLeft: new Map([['A', 12], ['D', 40.5]]),
      bestPickup: { teamId: 'B', player: 'Waiver Hero', points: 55 },
      worstTrade: { loser: 'Team D', winner: 'Team A', margin: 91, wins: 1 },
    });
    const by = (title: string) => awards.find((a) => a.title === title);
    expect(by('Luckiest')).toMatchObject({ teamName: 'Team C', isMe: true, detail: '0.7 wins more than their scoring earned' });
    expect(by('Unluckiest')).toMatchObject({ teamName: 'Team B', detail: '1.0 win fewer than their scoring earned' });
    expect(by('Highest score')).toMatchObject({ teamName: 'Team A', detail: '150.0 in week 1' });
    expect(by('Biggest blowout')).toMatchObject({ teamName: 'Team A', detail: 'beat Team C by 60.0 in week 2' });
    expect(by('Heartbreaker')).toMatchObject({ teamName: 'Team B', detail: 'lost to Team D by 1.0 in week 2' });
    expect(by('Benchwarmer')).toMatchObject({ teamName: 'Team D', detail: '40.5 points left on the bench' });
    expect(by('Best pickup')).toMatchObject({ teamName: 'Team B', detail: 'Waiver Hero: 55.0 started points since the claim' });
    expect(by('Worst trade')).toMatchObject({ teamName: 'Team D', detail: 'down 91 points over replacement to Team A (about 1.0 win)' });
  });

  it('waits for two finished weeks', () => {
    const one = games.filter((g) => g.week === 1);
    expect(seasonAwards(teams, one, luckTable(teams, one, 'A'), 'A')).toEqual([]);
  });
});
