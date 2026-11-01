import { describe, expect, it } from 'vitest';
import { looksLikeFfpcFaabReport, parseFfpcFaabReport } from './ffpcFaab';

// Real rows, with the rival team names changed. As FFPC shows them, the heading
// says Week 1 over every run, and bids can be entered long before they process.
const page = (...rows: string[]) =>
  [
    'Big Gorilla Tourney (Aug 5 9:00 PM) #104790 - Club 223 (4-3)',
    'FAAB Report',
    'Free Agent Auction Bidding (FAAB)',
    'Week   1 | 2 | 3 | 4 | 5 | 6 | 7 | 8',
    'All Leagues FAAB Report  Team FAAB History Report',
    'Week 1',
    'Bid Date',
    '(Processed)\tTeam\tAdded Player\tDropped Player\tBid\tResult',
    ...rows,
    '',
    '©2026 For Players, By Players LLC.',
  ].join('\n');

const WEEK_1 = page(
  "09/12 11:02 PM (SUN)\tTeam A\tDevaughn Vele, WR (NO)\tJayden Higgins WR HOU\t$87.00\tPlayer Added",
  '09/09 04:14 PM (SUN)\tNext Highest Bid\tDevaughn Vele, WR (NO)\t\t$71.00\t',
  '09/13 09:59 AM (SUN)\tTeam B\tBAL Team Defense, DF (BAL)\tColby Parkinson TE LAR\t$1.00\tPlayer Added',
  '09/12 09:21 AM (SUN)\tTeam C\tTyler Loop, PK (BAL)\tEvan Engram TE DEN\t$3.00\tPlayer Added',
  '09/08 08:58 PM (WED)\tTeam D\tChris Bell, WR (MIA)\tEli Stowers TE PHI\t$185.00\tPlayer Added',
  '09/08 10:36 PM (WED)\tClub 223\tChris Bell, WR (MIA)\t\t$11.00\tMatching High Bid Lost in Virtual Coin Toss',
  '09/08 08:30 PM (WED)\tNext Highest Bid\tChris Bell, WR (MIA)\t\t$75.00\t',
  '09/08 09:48 PM (WED)\tTeam E\tMalik Davis, RB (DAL)\tEmari Demercado RB HOU\t$104.00\tPlayer Added',
  '09/08 10:36 PM (WED)\tClub 223 - Next Highest Bid\tMalik Davis, RB (DAL)\t\t$83.00\t',
  '09/09 09:27 AM (WED)\tTeam B\tNajee Harris, RB (FA)\tDJ Giddens RB IND\t$73.00\tPlayer Added',
  '08/08 04:09 PM (WED)\tClub 223\tNajee Harris, RB (FA)\t\t$51.00\t',
  '09/08 08:29 PM (WED)\tNext Highest Bid\tNajee Harris, RB (FA)\t\t$60.00\t',
  '08/08 04:09 PM (WED)\tClub 223\tPat Bryant, WR (DEN)\tJaydon Blue RB PHI\t$29.00\tPlayer Added',
  '09/08 10:36 PM (WED)\tClub 223\tPat Bryant, WR (DEN)\t\t$29.00\tMatching High Bid Lost in Virtual Coin Toss',
  '09/09 09:25 AM (WED)\tNext Highest Bid\tPat Bryant, WR (DEN)\t\t$27.00\t',
);

describe('looksLikeFfpcFaabReport', () => {
  it('recognizes the FAAB Report, and not the add/drop page', () => {
    expect(looksLikeFfpcFaabReport(WEEK_1)).toBe(true);
    expect(looksLikeFfpcFaabReport('Available Players\nTeam Roster\nRemaining FAAB Dollars: $31')).toBe(false);
  });
});

describe('parseFfpcFaabReport', () => {
  const claims = parseFfpcFaabReport(WEEK_1, '2026');
  const claim = (player: string) => claims.find((c) => c.player === player)!;

  it('reads each winner with the player as the app names him', () => {
    expect(claims).toHaveLength(7);
    expect(claim('Devaughn Vele')).toEqual({ runOn: '2026-09-13', player: 'Devaughn Vele', position: 'WR', nflTeam: 'NO', team: 'Team A', bid: 87, losers: [71] });
    expect(claim('Tyler Loop')).toMatchObject({ position: 'K', nflTeam: 'BAL' });
    expect(claim('BAL DST')).toMatchObject({ position: 'DEF', nflTeam: 'BAL', bid: 1 });
    expect(claim('Najee Harris')).toMatchObject({ nflTeam: 'FA' });
  });

  it('counts every other bid on him as a losing bid, labelled or not', () => {
    expect(claim('Chris Bell').losers).toEqual([11, 75]);
    expect(claim('Malik Davis').losers).toEqual([83]);
    expect(claim('Najee Harris').losers).toEqual([51, 60]);
    expect(claim('Pat Bryant').losers).toEqual([29, 27]); // a real tie, and the next bid under it
  });

  it('knows a claim with no other rows had no other bid', () => {
    expect(claim('Tyler Loop').losers).toEqual([]);
  });

  it('dates a run from the latest bid in it, however early its other bids were', () => {
    expect(claim('Chris Bell').runOn).toBe('2026-09-09');
    expect(claim('Pat Bryant').runOn).toBe('2026-09-09'); // his winning bid was entered 08/08
    expect(claim('Tyler Loop').runOn).toBe('2026-09-13');
  });

  it("puts January's bids in the year after the season started", () => {
    const [c] = parseFfpcFaabReport(page('01/02 11:02 PM (SUN)\tTeam A\tTyler Loop, PK (BAL)\tEvan Engram TE DEN\t$3.00\tPlayer Added'), '2026');
    expect(c!.runOn).toBe('2027-01-03');
  });

  it('skips a losing bid on a player no one won, and reads big amounts', () => {
    const [c, ...rest] = parseFfpcFaabReport(
      page(
        '09/08 10:36 PM (WED)\tClub 223\tTyler Bass, PK (BUF)\t\t$1.00\t',
        '09/08 10:36 PM (WED)\tTeam A\tChris Bell, WR (MIA)\tEli Stowers TE PHI\t$1,000.00\tPlayer Added',
      ),
      '2026',
    );
    expect(c).toMatchObject({ player: 'Chris Bell', bid: 1000, losers: [] });
    expect(rest).toEqual([]);
  });
});
