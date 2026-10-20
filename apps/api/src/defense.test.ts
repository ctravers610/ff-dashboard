import { describe, expect, it } from 'vitest';
import { defenseTable } from './defense.js';

describe('defenseTable', () => {
  it('averages points allowed per game by position and ranks the softest first', () => {
    const table = defenseTable([
      // MIA faced two QBs in two games: 30 and 20.
      { game: '1:BUF-MIA', defense: 'MIA', position: 'QB', points: 30 },
      { game: '2:MIA-NE', defense: 'MIA', position: 'QB', points: 20 },
      // NYJ gave up 10 to a QB once; WRs in one game add up.
      { game: '1:NE-NYJ', defense: 'NYJ', position: 'QB', points: 10 },
      { game: '1:NE-NYJ', defense: 'NYJ', position: 'WR', points: 12 },
      { game: '1:NE-NYJ', defense: 'NYJ', position: 'WR', points: 8 },
    ]);
    expect(table.teams.MIA!.QB).toEqual({ allowed: 25, rank: 1 });
    expect(table.teams.NYJ!.QB).toEqual({ allowed: 10, rank: 2 });
    expect(table.teams.NYJ!.WR).toEqual({ allowed: 20, rank: 1 });
    expect(table.leagueAverage.QB).toBe(17.5);
    expect(table.games).toBe(3);
  });
});
