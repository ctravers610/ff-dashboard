import { describe, expect, it } from 'vitest';
import { summarizeBids, yahooSchedule } from './schedule.js';

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

describe('yahooSchedule', () => {
  // Thursday of week 8, 2026. Claims processed at 4:10 AM Eastern (8:10 UTC) the last two Wednesdays.
  const now = new Date('2026-10-29T20:00:00Z');
  const claim = (iso: string, bid: number, name: string) => ({ at: new Date(iso), fromWaivers: true, bid, player: p(name) });
  const adds = [
    claim('2026-10-28T08:10:00Z', 13, 'This Week'),
    claim('2026-10-28T08:10:30Z', 1, 'Cheap'),
    claim('2026-10-21T08:11:00Z', 25, 'Last Week'),
    claim('2026-10-21T08:10:00Z', 0, 'Free Claim'),
    { at: new Date('2026-10-28T16:24:00Z'), fromWaivers: false, bid: null, player: p('Free Agent') }, // added any time: not a run
  ];

  it('finds the run from when claims processed, ignoring free-agent pickups', () => {
    expect(yahooSchedule(adds, true, 8, now)).toMatchObject({ runs: [{ day: 3, time: '04:00' }], runsSource: 'history' });
  });

  it('credits each winning bid to the week it plays in', () => {
    expect(yahooSchedule(adds, true, 8, now).bids).toMatchObject({ count: 4, high: 25, top: [{ name: 'Last Week', bid: 25, week: 7 }, { name: 'This Week', bid: 13, week: 8 }, { name: 'Cheap', bid: 1, week: 8 }] });
  });

  it('has no bids outside FAAB leagues, and no runs without claims', () => {
    expect(yahooSchedule(adds, false, 8, now).bids).toBeNull();
    expect(yahooSchedule([], true, 8, now)).toEqual({ runs: [], runsSource: null, bids: null });
  });
});
