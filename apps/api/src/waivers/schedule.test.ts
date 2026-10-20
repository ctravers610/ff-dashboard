import { describe, expect, it } from 'vitest';
import { summarizeBids } from './schedule.js';

const p = (name: string) => ({ playerId: name, name, position: 'RB', nflTeam: 'KC', injuryStatus: null });

describe('summarizeBids', () => {
  it('gives the median, the most and the three biggest by name', () => {
    const s = summarizeBids([
      { player: p('A'), bid: 2, week: 1 },
      { player: p('B'), bid: 40, week: 2 },
      { player: null, bid: 12, week: 2 }, // a player we couldn't name still counts
      { player: p('C'), bid: 7, week: 3 },
      { player: p('D'), bid: 1, week: 4 },
    ]);
    expect(s).toMatchObject({ count: 5, median: 7, high: 40 });
    expect(s!.top.map((b) => `${b.name} $${b.bid}`)).toEqual(['B $40', 'C $7', 'A $2']);
  });

  it('is null with no winning bids', () => {
    expect(summarizeBids([])).toBeNull();
  });
});
