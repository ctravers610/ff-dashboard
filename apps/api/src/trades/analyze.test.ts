import { describe, expect, it } from 'vitest';
import { analyzeTrade, POINTS_PER_WIN, replacementLevel, type Acquired } from './analyze.js';

const weeks = (lines: [number, number, boolean, boolean][]) =>
  new Map(lines.map(([week, points, onRoster, started]) => [week, { points, onRoster, started }]));

const player = (name: string, position: string, lines: [number, number, boolean, boolean][], restOfSeason: number | null = null): Acquired => ({
  name,
  position,
  weeks: weeks(lines),
  restOfSeason,
});

describe('replacementLevel', () => {
  it('is the first player past the starters, with flex slots shared', () => {
    // 2 teams, each starting 1 RB, 1 WR and a FLEX: 3 RB-ish starters per position share.
    const scores = [20, 15, 10, 6, 2].map((points) => ({ position: 'RB', points })).concat([18, 12, 8, 4].map((points) => ({ position: 'WR', points })));
    const level = replacementLevel([...scores, { position: 'TE', points: 9 }, { position: 'TE', points: 5 }, { position: 'TE', points: 1 }], ['RB', 'WR', 'FLEX'], 2);
    // RB: 2 own + 2 × 1/3 of FLEX ≈ 3 starters -> 4th best (6). WR the same -> 4.
    expect(level.get('RB')).toBe(6);
    expect(level.get('WR')).toBe(4);
  });
});

describe('analyzeTrade', () => {
  const flat = () => 5; // replacement scores 5 every week

  it('scores started points over replacement, ranks the winner first, and converts to wins', () => {
    const report = analyzeTrade(
      't1',
      2,
      [
        { teamName: 'Sellers', isMe: false, received: [player('Bench Guy', 'WR', [[3, 9, true, false], [4, 7, true, false]])], picks: [], faab: 0 },
        { teamName: 'Buyers', isMe: true, received: [player('Star', 'RB', [[3, 30, true, true], [4, 25, true, true]])], picks: [], faab: 0 },
      ],
      flat,
      true,
    );
    expect(report.sides[0]!.teamName).toBe('Buyers');
    expect(report.sides[0]!.overReplacement).toBe(45); // (30 - 5) + (25 - 5)
    expect(report.sides[1]!.overReplacement).toBe(0); // never started
    expect(report.margin).toBe(45);
    expect(report.winsSwung).toBeCloseTo(45 / POINTS_PER_WIN, 1);
    expect(report.verdict).toBe(`Buyers won by 45.0 started points over replacement (about ${(45 / POINTS_PER_WIN).toFixed(1)} wins).`);
    expect(report.roast).toBe('Sellers traded for Bench Guy and has started them zero times. Buyers is 45 points to the good.');
  });

  it('only counts weeks on the new team, and calls a close one even', () => {
    const report = analyzeTrade(
      't2',
      5,
      [
        { teamName: 'A', isMe: false, received: [player('Cut Later', 'TE', [[5, 12, true, true], [6, 20, false, false]])], picks: [], faab: 0 },
        { teamName: 'B', isMe: false, received: [player('Steady', 'TE', [[5, 10, true, true]])], picks: ['2027 round 3'], faab: 0 },
      ],
      flat,
      false,
    );
    expect(report.sides.find((s) => s.teamName === 'A')!.received[0]!.points).toBe(12); // the 20 came after he left
    expect(report.margin).toBe(2);
    expect(report.verdict).toBe('Even so far.');
    expect(report.roast).toBeNull();
  });

  it('mentions the rest-of-season projection while the season is on', () => {
    const report = analyzeTrade(
      't3',
      3,
      [
        { teamName: 'Now', isMe: false, received: [player('Hot Start', 'WR', [[3, 25, true, true]], 20)], picks: [], faab: 0 },
        { teamName: 'Later', isMe: false, received: [player('Slow Start', 'WR', [[3, 6, true, true]], 90)], picks: [], faab: 0 },
      ],
      flat,
      false,
    );
    expect(report.verdict).toContain("Rest of season, Later's side projects 70 more points.");
  });
});
