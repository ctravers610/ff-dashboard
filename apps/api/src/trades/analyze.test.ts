import { describe, expect, it } from 'vitest';
import { analyzeTrade, projectedWeekGain, tradeSide, weekGain, type LeagueWeeks, type LineupPlayer, type SideInput, type SideWeek, type TeamWeek } from './analyze.js';

const slots = ['QB', 'RB', 'WR', 'W/R/T'];
const line = (id: string, position: string, points: number, projected: number | null, started: boolean): LineupPlayer => ({ id, position, points, projected, started });

describe('weekGain', () => {
  const starters = [line('qb', 'QB', 20, 18, true), line('rb', 'RB', 10, 12, true), line('wr', 'WR', 8, 11, true), line('flex', 'WR', 6, 9, true)];
  const bench = line('bench', 'RB', 30, 5, false);

  it('swaps the player given up back in for the one who came in his place', () => {
    const got = line('new', 'QB', 25, 16, true);
    const gain = weekGain(slots, [got, ...starters.slice(1), bench], new Set(['new']), [{ id: 'old', position: 'QB', points: 14, projected: 15 }]);
    expect(gain).toBe(11); // 25 from the new QB, 14 from the old one
  });

  it('gives no credit for a backup who never started, however much he scored', () => {
    const backup = line('backup', 'QB', 40, 10, false);
    expect(weekGain(slots, [...starters, backup], new Set(['backup']), [{ id: 'other', position: 'QB', points: 35, projected: 9 }])).toBe(0);
  });

  it('counts what a player given up would have added, when projections say he starts over someone kept', () => {
    // Projected 15 against the flex's 9, so he'd have started and scored 20 for the flex's 6.
    expect(weekGain(slots, [...starters, line('new', 'WR', 3, 2, false)], new Set(['new']), [{ id: 'old', position: 'WR', points: 20, projected: 15 }])).toBe(-14);
  });

  it("doesn't use hindsight: a player projected below the starters stays out, even after a big game", () => {
    expect(weekGain(slots, starters, new Set(), [{ id: 'old', position: 'WR', points: 50, projected: 4 }])).toBe(0);
  });

  it('fills a slot nobody traded can fill from the bench, and only then', () => {
    const got = line('new', 'RB', 15, 14, true);
    const gain = weekGain(slots, [starters[0]!, got, starters[2]!, starters[3]!, bench], new Set(['new']), []);
    expect(gain).toBe(-15); // the bench RB's 30 is what they'd have started instead
  });

  it('leaves out a player given up who was projected for nothing, such as on a bye', () => {
    const got = line('new', 'QB', 25, 16, true);
    expect(weekGain(slots, [got, ...starters.slice(1)], new Set(['new']), [{ id: 'old', position: 'QB', points: 0, projected: 0 }])).toBe(25);
  });

  it('keeps a starter with no projection, and lets someone with none fill only an open slot', () => {
    const unknown = line('rb', 'RB', 10, null, true);
    expect(weekGain(['QB', 'RB'], [starters[0]!, unknown], new Set(), [{ id: 'old', position: 'RB', points: 40, projected: 30 }])).toBe(0); // no flex to go in
    const got = line('new', 'QB', 25, 16, true);
    expect(weekGain(slots, [got, ...starters.slice(1)], new Set(['new']), [{ id: 'old', position: 'QB', points: 14, projected: null }])).toBe(11);
  });

  it('is nothing when the trade changed nothing that week, as when he is back on the team', () => {
    expect(weekGain(slots, starters, new Set(['elsewhere']), [{ id: 'qb', position: 'QB', points: 20, projected: 18 }])).toBe(0);
  });
});

describe('projectedWeekGain', () => {
  const roster = (extra: { id: string; position: string; projected: number | null }[]) => [{ id: 'qb', position: 'QB', projected: 20 }, { id: 'rb', position: 'RB', projected: 12 }, { id: 'wr', position: 'WR', projected: 11 }, { id: 'flex', position: 'WR', projected: 9 }, ...extra];

  it('gives nothing for a backup who projects to sit, however many points he projects', () => {
    expect(projectedWeekGain(slots, roster([{ id: 'backup', position: 'QB', projected: 18 }]), new Set(['backup']), [{ id: 'old', position: 'QB', projected: 17 }])).toBe(0);
  });

  it('is the difference in the best projected lineups', () => {
    expect(projectedWeekGain(slots, roster([{ id: 'star', position: 'RB', projected: 25 }]), new Set(['star']), [{ id: 'old', position: 'WR', projected: 10 }])).toBe(15); // 68 with the star (the RB moves to flex), 53 with the old WR at flex instead
  });

  it('counts the loss when the player got has since been dropped', () => {
    expect(projectedWeekGain(slots, roster([]), new Set(['dropped']), [{ id: 'old', position: 'WR', projected: 15 }])).toBe(-6);
  });
});

describe('tradeSide', () => {
  const week = (players: LineupPlayer[], score: number, opponent: TeamWeek['opponent'] = null): TeamWeek => ({ players, score, opponent });
  const league: LeagueWeeks = {
    slots: ['QB'],
    finished: [4, 5, 6],
    left: [7, 8],
    final: false,
    teamWeek: (w, teamId) => {
      if (teamId === 'a') {
        if (w === 4) return week([line('old', 'QB', 30, 18, true)], 100); // before the trade
        if (w === 5) return week([line('new', 'QB', 25, 16, true)], 100);
        if (w === 6) return week([line('new', 'QB', 10, 16, false), line('third', 'QB', 22, 17, true)], 90);
      }
      return null;
    },
    tradedPlayer: (w, id) => (id === 'old' ? { points: w === 5 ? 14 : 40, projected: w === 5 ? 15 : w === 6 ? 18 : 10 } : { points: 0, projected: 12 }),
    rosterAhead: (_, teamId) => (teamId === 'a' ? [{ id: 'new', position: 'QB', projected: 12 }] : []),
  };
  const moves = [{ id: 'new', name: 'New QB', position: 'QB', toTeamId: 'a' }, { id: 'old', name: 'Old QB', position: 'QB', toTeamId: 'b' }];

  it('scores the weeks from the trade on and reports what he has done', () => {
    const side = tradeSide({ id: 'a', name: 'A', isMe: true }, moves, 5, league);
    expect(side.weeks.map((w) => [w.week, w.gain])).toEqual([[5, 11], [6, -18]]); // 25 vs 14; 22 vs the 40 the old QB would have started for
    expect(side.projectedGain).toBe(4); // 12 vs 10, twice
    expect(side.received[0]!.restOfSeason).toBe(24);
    expect(side.received[0]!.weeks.get(6)).toEqual({ points: 10, onRoster: true, started: false });
    expect(side.received[0]!.weeks.has(4)).toBe(false);
  });

  it('skips the projections once the season is over', () => {
    const side = tradeSide({ id: 'a', name: 'A', isMe: true }, moves, 5, { ...league, final: true });
    expect(side.projectedGain).toBe(0);
    expect(side.received[0]!.restOfSeason).toBeNull();
  });

  it('has no projection for a player no longer on the team', () => {
    const side = tradeSide({ id: 'a', name: 'A', isMe: true }, moves, 5, { ...league, rosterAhead: () => [] });
    expect(side.received[0]!.restOfSeason).toBeNull();
  });
});

describe('analyzeTrade', () => {
  const acquired = (name: string, position: string, lines: [number, number, boolean, boolean][], restOfSeason: number | null = null) => ({
    name,
    position,
    weeks: new Map(lines.map(([w, points, onRoster, started]) => [w, { points, onRoster, started }])),
    restOfSeason,
  });
  const side = (teamId: string, received: SideInput['received'], weeks: Omit<SideWeek, 'opponent'>[] & { opponent?: SideWeek['opponent'] }[], projectedGain = 0, picks: string[] = []): SideInput => ({
    teamId,
    teamName: teamId,
    isMe: false,
    received,
    picks,
    faab: 0,
    weeks: weeks.map((w) => ({ opponent: null, ...w })) as SideWeek[],
    projectedGain,
  });

  it('ranks the side whose lineups gained most first, by real points', () => {
    const report = analyzeTrade(
      't1',
      2,
      [
        side('Sellers', [acquired('Bench Guy', 'WR', [[3, 9, true, false], [4, 7, true, false]])], [{ week: 3, gain: -12, score: 100 }, { week: 4, gain: -8, score: 100 }]),
        side('Buyers', [acquired('Star', 'RB', [[3, 30, true, true], [4, 25, true, true]])], [{ week: 3, gain: 15, score: 100 }, { week: 4, gain: 10, score: 100 }]),
      ],
      true,
    );
    expect(report.sides.map((s) => s.teamName)).toEqual(['Buyers', 'Sellers']);
    expect(report.sides.map((s) => s.gain)).toEqual([25, -20]);
    expect(report.margin).toBe(45);
    expect(report.winsSwung).toBe(0);
    expect(report.verdict).toBe('Buyers won by 45.0 lineup points.');
    expect(report.roast).toBe('Sellers traded for Bench Guy and has started them zero times. Buyers is 45 points to the good.');
  });

  it('flips a game when the score without the trade would have gone the other way', () => {
    const them = (score: number) => ({ id: 'rival', name: 'Rival', score });
    const report = analyzeTrade(
      't2',
      5,
      [
        side('A', [acquired('Good', 'WR', [[5, 20, true, true]])], [{ week: 5, gain: 12, score: 100, opponent: them(95) }, { week: 6, gain: 12, score: 130, opponent: them(95) }]),
        side('B', [acquired('Bad', 'WR', [[5, 5, true, true]])], [{ week: 5, gain: -10, score: 90, opponent: them(95) }, { week: 6, gain: 0, score: 90, opponent: them(95) }]),
      ],
      false,
    );
    expect(report.sides[0]!.flips).toEqual([{ week: 5, opponent: 'Rival', won: true }]); // 88 without it; week 6 was won either way
    expect(report.sides[1]!.flips).toEqual([{ week: 5, opponent: 'Rival', won: false }]); // 100 without it
    expect(report.winsSwung).toBe(2);
    expect(report.verdict).toBe('A is winning by 34.0 lineup points. It has flipped 2 games.');
    expect(report.roast).toBe('B handed over Good and it cost them week 5 against Rival. A is 34 lineup points to the good and counting.');
  });

  it('says so, and holds the roast, when the side behind on points got the win out of it', () => {
    const report = analyzeTrade(
      't9',
      5,
      [
        side('Points', [], [{ week: 5, gain: 30, score: 150, opponent: { id: 'x', name: 'X', score: 100 } }]),
        side('Wins', [], [{ week: 5, gain: 2, score: 101, opponent: { id: 'y', name: 'Y', score: 100 } }]),
      ],
      false,
    );
    expect(report.sides[0]!.teamName).toBe('Points');
    expect(report.winsSwung).toBe(-1);
    expect(report.verdict).toBe('Points is winning by 28.0 lineup points. But the results favor Wins: it has flipped 1 game.');
    expect(report.roast).toBeNull();
  });

  it('uses both new scores when the trade partners played each other, and counts that game once', () => {
    const report = analyzeTrade(
      't3',
      5,
      [
        side('A', [], [{ week: 5, gain: 20, score: 100, opponent: { id: 'B', name: 'B', score: 95 } }]),
        side('B', [], [{ week: 5, gain: -20, score: 95, opponent: { id: 'A', name: 'A', score: 100 } }]),
      ],
      false,
    );
    expect(report.sides[0]!.flips).toEqual([{ week: 5, opponent: 'B', won: true }]); // 80 vs 115 without it
    expect(report.sides[1]!.flips).toEqual([{ week: 5, opponent: 'A', won: false }]);
    expect(report.verdict).toContain('It has flipped 1 game.');
  });

  it("doesn't call a tie a flip", () => {
    const report = analyzeTrade('t4', 5, [side('A', [], [{ week: 5, gain: 5, score: 100, opponent: { id: 'x', name: 'X', score: 95 } }]), side('B', [], [])], false);
    expect(report.sides.find((s) => s.teamName === 'A')!.flips).toEqual([]);
  });

  it('calls a close one even, and says when it helped or hurt both', () => {
    const close = analyzeTrade('t5', 5, [side('A', [], [{ week: 5, gain: 12, score: 100 }]), side('B', [], [{ week: 5, gain: 10, score: 100 }], 0, ['2027 round 3'])], false);
    expect(close.margin).toBe(2);
    expect(close.verdict).toBe('Even so far. Both lineups are better for it.');
    expect(close.roast).toBeNull();
    const worse = analyzeTrade('t6', 5, [side('A', [], [{ week: 5, gain: -12, score: 100 }]), side('B', [], [{ week: 5, gain: -10, score: 100 }])], true);
    expect(worse.verdict).toBe('Even trade: neither side came out ahead. Both lineups are worse for it.');
  });

  it('reports the rest-of-season projection while the season is on, without letting it pick the winner', () => {
    const report = analyzeTrade(
      't7',
      3,
      [
        side('Now', [], [{ week: 3, gain: 19, score: 100 }], 20),
        side('Later', [], [{ week: 3, gain: 0, score: 100 }], 90),
      ],
      false,
    );
    expect(report.sides[0]!.teamName).toBe('Now');
    expect(report.verdict).toContain('Rest of season, Later projects to gain 70 more lineup points.');
    expect(analyzeTrade('t8', 3, [side('Now', [], [], 20), side('Later', [], [], 90)], true).verdict).not.toContain('Rest of season');
  });
});
