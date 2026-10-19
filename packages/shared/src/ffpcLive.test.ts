import { describe, expect, it } from 'vitest';
import { looksLikeFfpcPage } from './ffpc';
import { convertFfpcLiveScoring, looksLikeFfpcLiveScoring } from './ffpcLive';

// Trimmed copy of an FFPC Live Scoring page, with made-up team names.
const PAGE = [
  'Scoreboard - All Play Week ',
  'Week 6 (Current)',
  'Rival Team',
  '141',
  'PMR: 60\tProj: 166',
  'Sample Squad',
  '140',
  'PMR: 60\tProj: 151',
  '',
  'Sample Squad',
  'In Play:\t0',
  'Yet To Play:\t1',
  'Player Min Remaining:\t60',
  'Projected Points:\t150.54',
  '140.45',
  '',
  'Rival Team',
  'In Play:\t0',
  'Yet To Play:\t1',
  'Player Min Remaining:\t60',
  'Projected Points:\t165.90',
  '140.70',
  'QB\t\t',
  'Drake Maye NE',
  '235 PaYds, 3 PaTD (42,9,7), 24 RuYds',
  '26.15',
  'NENYJ',
  '2nd & 11NYJ 19 NE 26 vs NYJ | Final',
  'Flex\t\t',
  'Matthew Golden GB',
  '104 ReYds, 6 Rec, 1 ReTD (9)',
  '22.40',
  'PK\t\t',
  'Eddy Pineiro SF',
  'Projected Points: 10.09',
  '0.00',
  'SFWAS',
  'DST\t\t',
  'SEA Team Defense SEA',
  '17 OffPA, 2 Sck',
  '5.00',
  'Pos\tBench\tStatus\tStats\tTotal',
  'QB\tBryce Young, CAR\tPHI',
  '25-14',
  'Final\t281 PaYds, 2 PaTD (12,19), 6 RuYds\t22.65',
  'RB\tSamaje Perine, CIN\tBYE\t\t0.00',
  'QB\t\t',
  'Brock Purdy SF',
  'Projected Points: 25.20',
  '0.00',
  'Flex\t\t',
  'Hunter Henry NE',
  '48 ReYds, 4 Rec, 1 ReTD (7)',
  '16.80',
  'DST\t\t',
  'NE Team Defense NE',
  '19 OffPA, 3 Sck, 1 Int',
  '8.00',
  'Pos\tBench\tStatus\tStats\tTotal',
  'QB\tC.J. Stroud, HOU\tJAC',
  'Live Chat',
].join('\n');

describe('FFPC Live Scoring import', () => {
  it('recognises the Live Scoring page and not the roster page', () => {
    expect(looksLikeFfpcLiveScoring(PAGE)).toBe(true);
    expect(looksLikeFfpcPage(PAGE)).toBe(false);
    expect(looksLikeFfpcLiveScoring('QB Josh Allen')).toBe(false);
  });

  it('reads the week, both teams and their scores', () => {
    const m = convertFfpcLiveScoring(PAGE, 'Sample Squad', '2026-10-19T20:00:00Z')!;
    expect(m.week).toBe(6);
    expect(m.capturedAt).toBe('2026-10-19T20:00:00Z');
    expect([m.me.teamName, m.me.points]).toEqual(['Sample Squad', 140.45]);
    expect([m.opponent.teamName, m.opponent.points]).toEqual(['Rival Team', 140.7]);
  });

  it("reads each team's starters with slots and points, skipping bench tables", () => {
    const m = convertFfpcLiveScoring(PAGE, 'Sample Squad')!;
    expect(m.me.starters).toEqual([
      { slot: 'QB', name: 'Drake Maye', points: 26.15 },
      { slot: 'FLEX', name: 'Matthew Golden', points: 22.4 },
      { slot: 'K', name: 'Eddy Pineiro', points: 0 },
      { slot: 'DEF', name: 'SEA DST', points: 5 },
    ]);
    expect(m.opponent.starters.map((s) => s.name)).toEqual(['Brock Purdy', 'Hunter Henry', 'NE DST']);
  });

  it('identifies my team by name even when it is listed second', () => {
    const m = convertFfpcLiveScoring(PAGE, 'rival team')!;
    expect(m.me.teamName).toBe('Rival Team');
    expect(m.me.starters[0]!.name).toBe('Brock Purdy');
  });

  it('returns null for text without two score blocks', () => {
    expect(convertFfpcLiveScoring('QB\t\nDrake Maye NE\n26.15')).toBeNull();
  });
});
