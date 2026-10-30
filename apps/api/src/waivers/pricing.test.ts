import { describe, expect, it } from 'vitest';
import type { ContestedClaim, Player, WaiverPlayer } from '@ffd/shared';
import { backtest, bestUse, bidsFaced, calibrate, chanceAt, chooseBid, estimateShare, knownBefore, moveWorth, noRivalChance, priceFor, projectedRanks, rivalBids, standardPoints, tieChance, weightOf, withLosingBids, type PastClaim } from './pricing.js';

const claim = (o: Partial<PastClaim> = {}): PastClaim => ({ league: 'yahoo:1', position: 'RB', rank: 30, season: 2026, week: 6, share: 0.1, ...o });
const target = { league: 'yahoo:1', position: 'RB', rank: 30, season: 2026, week: 6 };

describe('how much a past claim says about a player', () => {
  it('counts only the same position (ESPN’s D/ST is a DEF)', () => {
    expect(weightOf(claim({ position: 'WR' }), target)).toBe(0);
    expect(weightOf(claim({ position: 'D/ST' }), { ...target, position: 'DEF' })).toBeGreaterThan(0);
  });

  it('counts most for a similar player, at a similar time, in the same league, recently', () => {
    const same = weightOf(claim(), target);
    expect(same).toBe(2); // the league's own claim counts double
    expect(weightOf(claim({ league: 'sleeper:9' }), target)).toBe(1);
    expect(weightOf(claim({ rank: 90 }), target)).toBeLessThan(0.2 * same);
    expect(weightOf(claim({ week: 14 }), target)).toBeLessThan(0.2 * same);
    expect(weightOf(claim({ season: 2024 }), target)).toBeCloseTo(same * 0.64);
  });
});

describe('a likely winning bid', () => {
  // Similar RBs went for 4% to 20% of the budget.
  const claims = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2].map((share) => claim({ share }));

  it('is the middle of similar winning bids, with the range half of them fell in', () => {
    expect(estimateShare(claims, target)).toEqual({ low: 0.06, typical: 0.1, high: 0.15, basedOn: 7 });
    expect(priceFor(claims, target, 200)).toEqual({ low: 12, typical: 20, high: 30, basedOn: 7 });
  });

  it('isn’t given without enough similar claims', () => {
    expect(estimateShare(claims.slice(0, 3), target)).toBeNull();
    expect(estimateShare(claims, { ...target, position: 'TE' })).toBeNull();
  });
});

describe('the losing bids on a league\u2019s claims', () => {
  const player = (name: string): Player => ({ playerId: name, name, position: 'RB', nflTeam: 'BUF', injuryStatus: null });
  const win = (name: string, bid: number) => ({ player: player(name), bid, week: 3 });
  const contest = (name: string, amount: number, losers: [number, string][]): ContestedClaim => ({
    player: name,
    position: 'RB',
    nflTeam: 'BUF',
    when: 'Oct 14, 3:59 am',
    winner: { team: 'Winner', mine: false, amount, reason: null },
    losers: losers.map(([amt, reason]) => ({ team: 'Other', mine: false, amount: amt, reason })),
  });

  it('come from the site, matched by player and winning bid', () => {
    expect(withLosingBids([win('Fake Back', 20)], [contest('Fake Back', 20, [[3, 'Lower Offer'], [7, 'Lower waiver priority']])])[0]!.losers).toEqual([3, 7]);
  });

  it('are none on a claim the site doesn\u2019t list, or whose only other bid never counted', () => {
    expect(withLosingBids([win('Fake Back', 20)], [contest('Other Back', 20, [[3, 'Lower Offer']])])[0]!.losers).toEqual([]);
    expect(withLosingBids([win('Fake Back', 20)], [contest('Fake Back', 20, [[40, 'Invalid claim due to previous transaction']])])[0]!.losers).toEqual([]);
  });

  it('stay unknown without the site', () => {
    expect(withLosingBids([win('Fake Back', 20)], null)[0]!.losers).toBeUndefined();
  });
});

describe('what each team that bid had to beat', () => {
  it('is the next bid for the winner, and the winner\u2019s bid for each loser', () => {
    expect(bidsFaced(claim({ share: 0.2, rivals: [0.05, 0.1] }))).toEqual([0.1, 0.2, 0.2]);
  });

  it('is no one when no one else bid', () => {
    expect(bidsFaced(claim({ share: 0.2, rivals: [] }))).toEqual([null]);
  });

  it('is only what a rival paid when the losing bids aren\u2019t known', () => {
    expect(bidsFaced(claim({ share: 0.2 }))).toEqual([0.2]);
  });
});

describe('how often no one else bids', () => {
  it('is the share of bids on similar claims with no other bid', () => {
    // Three claims with one bid each, one claim with two bids: 3 of 5 bids stood alone.
    const claims = [claim({ rivals: [] }), claim({ rivals: [] }), claim({ rivals: [] }), claim({ rivals: [0.05] })];
    expect(noRivalChance(claims, target)).toBeCloseTo(3 / 5);
  });

  it('is unknown, so zero, without any known losing bids', () => {
    expect(noRivalChance([claim(), claim()], target)).toBe(0);
    expect(noRivalChance([claim({ position: 'WR', rivals: [] })], target)).toBe(0);
  });

  it('is never certain', () => {
    expect(noRivalChance([claim({ rivals: [] }), claim({ rivals: [] })], target)).toBe(0.9);
  });
});

describe('the odds of a bid', () => {
  const claims = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2].map((share) => claim({ share }));
  const odds = (topRival: number | null = null) => rivalBids(claims, target, 100, topRival)!;

  it('rise with the bid, and aren’t certain until no one can top it', () => {
    expect(chanceAt(odds(), 5, 0)).toBeCloseTo(1 / 8);
    expect(chanceAt(odds(), 11, 0)).toBeCloseTo(4 / 8);
    expect(chanceAt(odds(), 99, 0)).toBeCloseTo(7 / 8);
    expect(chanceAt(odds(), 101, 0)).toBe(1);
  });

  it('are certain once you top every other team’s balance', () => {
    expect(chanceAt(odds(9), 10, 0)).toBe(1);
    expect(chanceAt(odds(9), 9, 0)).toBeCloseTo(3 / 8);
  });

  it('count a tie by your place in the claim order', () => {
    expect(tieChance(1, 12)).toBe(1);
    expect(tieChance(12, 12)).toBe(0);
    expect(tieChance(null, 12)).toBe(0);
    expect(chanceAt(odds(), 6, 1)).toBeCloseTo(2 / 8);
    expect(chanceAt(odds(), 6, 0)).toBeCloseTo(1 / 8);
  });

  it('let a free bid win as often as no one else bids on similar players', () => {
    const quiet = claims.map((c) => ({ ...c, rivals: [c.share / 2] })); // 14 bids
    const alone = [claim({ rivals: [] }), claim({ rivals: [] }), claim({ rivals: [] }), claim({ rivals: [] })];
    const odds = rivalBids([...quiet, ...alone], target, 100)!;
    expect(chanceAt(odds, 0, 0)).toBeCloseTo(4 / 18);
    // Beating every bid short of a made-up bidding war, the rest of the way there.
    expect(chanceAt(odds, 99, 0)).toBeGreaterThan(0.9);
    expect(chanceAt(odds, 99, 0)).toBeLessThan(1);
  });

  it('aren\u2019t given when similar claims never had a rival', () => {
    const alone = Array.from({ length: 6 }, () => claim({ rivals: [] }));
    expect(estimateShare(alone, target)).toBeNull();
    expect(rivalBids(alone, target, 100)).toBeNull();
  });

  it('aren’t given without enough similar claims', () => {
    expect(rivalBids(claims.slice(0, 3), target, 100)).toBeNull();
  });
});

describe('what a move is worth', () => {
  const wp = (restOfSeason: number): WaiverPlayer => ({ player: { playerId: 'x', name: 'X', position: 'RB', nflTeam: 'BUF', injuryStatus: null }, week: 10, restOfSeason, availability: null, trendingAdds: null });

  it('is its share of the points your money could still buy', () => {
    // $55 over 10 weeks could buy 3 × 55 = 165 points; this move adds 5 a week for 10 weeks.
    expect(moveWorth({ gain: 5, add: wp(150), replaces: wp(100) }, 55, 10)).toBe(17);
  });

  it('counts one good week when he won’t outlast who he fills in for', () => {
    expect(moveWorth({ gain: 6, add: wp(90), replaces: wp(150) }, 55, 10)).toBe(2);
  });

  it('assumes the gain lasts when he fills an empty slot', () => {
    expect(moveWorth({ gain: 5, add: wp(150), replaces: null }, 55, 10)).toBe(17);
  });

  it('climbs as the weeks run out, up to everything you have', () => {
    const late = moveWorth({ gain: 5, add: wp(10), replaces: wp(5) }, 55, 2);
    expect(late).toBe(31); // $55 over 2 weeks buys 9 points; 5 of them
    expect(moveWorth({ gain: 5, add: wp(10), replaces: wp(5) }, 55, 1)).toBe(55);
  });
});

describe('what any available player would do for your lineup', () => {
  const wp = (name: string, position: string, week: number, restOfSeason: number, team = 'BUF', injuryStatus: Player['injuryStatus'] = null): WaiverPlayer => ({
    player: { playerId: name, name, position, nflTeam: team, injuryStatus },
    week,
    restOfSeason,
    availability: 'waivers',
    trendingAdds: null,
  });
  const rb = wp('Starting Back', 'RB', 10, 100);
  const wr = wp('Starting Receiver', 'WR', 8, 80);
  const lineup = { starters: [{ slot: 'RB', player: rb }, { slot: 'WR', player: wr }, { slot: 'FLEX', player: wp('Flex Back', 'RB', 12, 120) }], bench: [] };

  it('is his best slot, measured over the rest of the season', () => {
    const add = wp('New Receiver', 'WR', 11, 110);
    expect(bestUse(add, lineup, null, 10)).toMatchObject({ gain: 3, replaces: wr });
  });

  it('can’t play a slot his position doesn’t fit', () => {
    expect(bestUse(wp('New Quarterback', 'QB', 30, 300), lineup, null, 10)).toBeNull();
  });

  it('adds nothing when he wouldn’t start, and is worth nothing', () => {
    const use = bestUse(wp('Deep Receiver', 'WR', 2, 20), lineup, null, 10)!;
    expect(use.gain).toBe(-6);
    expect(moveWorth(use, 50, 10)).toBe(0);
  });

  it('is measured against a bench player who already covers the slot', () => {
    const backup = wp('Good Backup', 'WR', 12, 120);
    const use = bestUse(wp('New Receiver', 'WR', 11, 110), { ...lineup, bench: [backup] }, null, 10)!;
    expect(use).toMatchObject({ gain: -1, replaces: backup });
    expect(moveWorth(use, 50, 10)).toBe(0);
  });

  it('counts a starter on bye as no one this week, but he’s still back after', () => {
    const away = wp('Away Receiver', 'WR', 0, 90, 'DEN');
    const use = bestUse(wp('Fill In', 'WR', 7, 70), { starters: [{ slot: 'WR', player: away }], bench: [] }, new Set(['DEN']), 10)!;
    expect(use).toMatchObject({ gain: 7, replaces: away });
    expect(moveWorth(use, 50, 10)).toBe(2); // 7 of 165 points, not 7 a week
  });

  it('assumes the gain lasts in an empty slot with no one to fill it', () => {
    const use = bestUse(wp('New Receiver', 'WR', 5, 50), { starters: [{ slot: 'WR', player: null }], bench: [] }, null, 10)!;
    expect(use).toMatchObject({ gain: 5, replaces: null });
    expect(moveWorth(use, 55, 10)).toBe(17);
  });
});

describe('the bid to make', () => {
  const rivals = [{ amount: 2, weight: 1 }, { amount: 5, weight: 1 }, { amount: 8, weight: 1 }, { amount: 50, weight: 1 }];

  it('is the one with the best payoff, below what he’s worth', () => {
    // Payoffs at $6: 2/4 × 24; at $9: 3/4 × 21, the best; at $51: 4/4 × -21.
    expect(chooseBid(rivals, 30, 100, 0)).toMatchObject({ bid: 9, chance: 0.75, worth: 30 });
  });

  it('bids less when he’s worth less', () => {
    expect(chooseBid(rivals, 8, 100, 0).bid).toBe(3);
  });

  it('never bids more than you have', () => {
    expect(chooseBid(rivals, 30, 7, 0)).toMatchObject({ bid: 6, chance: 0.5 });
  });

  it('wins ties instead of paying a dollar more when you’re first in line', () => {
    expect(chooseBid(rivals, 30, 100, 1).bid).toBe(8);
  });

  it('shows the odds at other bids, cheapest first, with the bid among them', () => {
    expect(chooseBid(rivals, 30, 100, 0).odds).toEqual([{ bid: 6, chance: 0.5 }, { bid: 9, chance: 0.75 }, { bid: 51, chance: 1 }]);
  });

  it('stays at $0 when he’s worth nothing', () => {
    expect(chooseBid(rivals, 0, 100, 0).bid).toBe(0);
  });
});

describe('backtesting', () => {
  it('checks the odds against what bids would really have done', () => {
    // Every rival bid is 10% of the budget, so a bid above that wins every time.
    const steady = Array.from({ length: 12 }, (_, i) => claim({ season: 2020 + i, share: 0.1 }));
    const [half] = calibrate(steady, () => true, [0.5]);
    expect(half!.tried).toBeGreaterThan(0);
    expect(half!.won).toBe(half!.tried);
  });

  it('checks the bids of every team on a claim, and only the claims asked for', () => {
    const history = Array.from({ length: 12 }, () => claim({ season: 2020, share: 0.1, rivals: [0.05] }));
    const latest = claim({ season: 2021, share: 0.1, rivals: [0.05] });
    const [half] = calibrate([...history, latest], (c) => c.season === 2021, [0.5]);
    expect(half!.tried).toBe(2);
  });

  it('prices each claim only from what came before it', () => {
    expect(knownBefore(claim({ season: 2025, week: 15 }), claim({ week: 2 }))).toBe(true);
    expect(knownBefore(claim({ week: 6 }), claim({ week: 6 }))).toBe(false);
    // Last season's five identical claims price this season's exactly; nothing came before them.
    const steady = [...Array.from({ length: 5 }, () => claim({ season: 2025, share: 0.05 })), claim({ share: 0.05 })];
    expect(backtest(steady)).toEqual({ claims: 6, priced: 1, inRange: 1, medianMiss: 0 });
  });
});

describe('projected ranks', () => {
  it('ranks players within their position by projected points over the weeks given, skipping the unprojected', () => {
    type Stats = Record<string, number>;
    const weeks = [
      standardPoints(new Map<string, Stats>([['rb1', { rush_yd: 80 }], ['rb2', { rush_yd: 60, rush_td: 1 }], ['wr1', { rec: 5, rec_yd: 70 }], ['rb3', {}]])),
      standardPoints(new Map<string, Stats>([['rb1', { rush_yd: 90 }], ['rb2', { rush_yd: 40 }]])),
    ];
    const positions: Record<string, string> = { rb1: 'RB', rb2: 'RB', rb3: 'RB', wr1: 'WR' };
    expect(projectedRanks(weeks, (id) => positions[id] ?? null)).toEqual(new Map([['rb1', 1], ['rb2', 2], ['wr1', 1]]));
  });
});
