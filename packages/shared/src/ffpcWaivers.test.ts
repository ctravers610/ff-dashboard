import { describe, expect, it } from 'vitest';
import { looksLikeFfpcWaivers, parseFfpcWaivers } from './ffpcWaivers';

// The shape of FFPC's add/drop page as copied from the browser, with made-up
// league, team names and numbers. Tabs separate the stat columns.
const PAGE = [
  'someone',
  'My Teams',
  'Big Gorilla Tourney (Aug 5 9:00 PM) #55555 - Made Up Club (3-2)',
  'Transactions',
  'Free Agent Auction Bidding',
  'Remaining FAAB Dollars: $1,136',
  "Your league is currently in a Free Agent Auction Bidding period. Bids will be processed Wednesdays at 11 pm ET and Sundays at 10 am ET. To place a bid, click the 'Add' button.",
  '$900',
  'Team One',
  '$450',
  'Team Two',
  'Bid Group Details',
  'Available Players',
  'Position: All QB RB WR TE PK DF WL',
  'Player\tNext Opp\tBye\tOpp Rnk\tLast\tProj\tAvg\tPts\t% Own',
  'Add\t',
  'Jones, Daniel IND (QB)',
  'TEN\t13\t11\t13.75\t18.35\t12.91\t64.55\t90.6',
  'Add\t',
  'Grupe, Blake LAR (PK) Q',
  'ARI\t11\t18\t0\t9.46\t0\t0\t22.5',
  'Add\t',
  'IND DST',
  'TEN\t13\t27\t-1\t8.78\t3.2\t16\t70.9',
  'Add\t',
  "Croskey-Merritt, Jacory WAS (RB) O",
  '@SF\t7\t31\t8\t4.11\t8.72\t43.6\t3.4',
  'Team Roster',
  'Player\tBYE\tPR\tPROJ\tPPG',
  'Drop\t',
  'Maye, Drake NE (QB)',
  '11\t8\t23.64\t21.7',
  'Drop\t',
  'SEA DST',
  '11\t2\t8.48\t9.4',
  '©2026 For Players, By Players LLC.',
  'Smith, Fake NYJ (WR)',
  '1\t2\t3\t4',
].join('\n');

describe('parseFfpcWaivers', () => {
  it('recognizes the page', () => {
    expect(looksLikeFfpcWaivers(PAGE)).toBe(true);
    expect(looksLikeFfpcWaivers('QB Josh Allen')).toBe(false);
  });

  it('reads the league, FAAB, bid schedule and team count', () => {
    const page = parseFfpcWaivers(PAGE);
    expect(page).toMatchObject({
      leagueNumber: '#55555',
      teamName: 'Made Up Club',
      faabLeft: 1136,
      bidSchedule: 'Wednesdays at 11 pm ET and Sundays at 10 am ET',
      teams: 3,
    });
  });

  it('reads available players with FFPC’s projection, bye and injury code', () => {
    const { available } = parseFfpcWaivers(PAGE);
    expect(available).toEqual([
      { name: 'Daniel Jones', nflTeam: 'IND', position: 'QB', injury: null, bye: 13, projected: 18.35, percentOwned: 90.6 },
      { name: 'Blake Grupe', nflTeam: 'LAR', position: 'K', injury: 'Q', bye: 11, projected: 9.46, percentOwned: 22.5 },
      { name: 'IND DST', nflTeam: 'IND', position: 'DEF', injury: null, bye: 13, projected: 8.78, percentOwned: 70.9 },
      { name: 'Jacory Croskey-Merritt', nflTeam: 'WAS', position: 'RB', injury: 'O', bye: 7, projected: 4.11, percentOwned: 3.4 },
    ]);
  });

  it('reads your roster, and nothing after the page footer', () => {
    const { roster } = parseFfpcWaivers(PAGE);
    expect(roster.map((p) => [p.name, p.bye, p.projected])).toEqual([
      ['Drake Maye', 11, 23.64],
      ['SEA DST', 11, 8.48],
    ]);
  });
});
