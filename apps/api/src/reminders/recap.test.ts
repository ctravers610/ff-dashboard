import type { LineupRecap, RecapResponse } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { isRecapTime, recapMessage } from './recap.js';

describe('isRecapTime', () => {
  it('runs from Tuesday 9 AM Eastern until Wednesday noon', () => {
    expect(isRecapTime(new Date('2026-10-20T12:30:00Z'))).toBe(false); // Tue 8:30 AM EDT
    expect(isRecapTime(new Date('2026-10-20T13:05:00Z'))).toBe(true); // Tue 9:05 AM
    expect(isRecapTime(new Date('2026-10-21T15:30:00Z'))).toBe(true); // Wed 11:30 AM
    expect(isRecapTime(new Date('2026-10-21T16:30:00Z'))).toBe(false); // Wed 12:30 PM
    expect(isRecapTime(new Date('2026-10-19T13:05:00Z'))).toBe(false); // Monday
  });
});

const league = (over: Partial<LineupRecap>): LineupRecap => ({
  platform: 'sleeper',
  leagueId: 'L',
  leagueName: 'League',
  week: 5,
  points: 100,
  best: 100,
  leftOnBench: 0,
  opponentPoints: 90,
  result: 'win',
  bestWouldWin: false,
  calls: [],
  missedPickups: null,
  pickupsNote: null,
  ...over,
});

describe('recapMessage', () => {
  it('sums the week up across leagues', () => {
    const recap: RecapResponse = {
      season: '2026',
      week: 5,
      weeks: [5],
      errors: [],
      leagues: [
        league({ leagueName: 'Other employment league', leftOnBench: 0 }),
        league({
          leagueName: 'What Do Electric Boogaloo',
          result: 'loss',
          bestWouldWin: true,
          leftOnBench: 8.5,
          calls: [{ slot: 'FLEX', started: { name: 'Jeremiyah Love', points: 2.2 }, better: { name: 'Ashton Jeanty', points: 10.7 }, cost: 8.5 }],
        }),
        league({
          leagueName: 'Massholes',
          leftOnBench: 18.2,
          calls: [{ slot: 'RB', started: { name: 'RJ Harvey', points: 0.7 }, better: { name: 'J.K. Dobbins', points: 15.4 }, cost: 14.7 }],
        }),
      ],
    };
    expect(recapMessage(recap)).toEqual({
      title: 'Week 5 recap: 2-1',
      body: '26.7 points left on benches. The best lineup would have won What Do Electric Boogaloo. Biggest miss: J.K. Dobbins over RJ Harvey in Massholes (+14.7).',
      url: '/?view=history',
      tag: 'recap',
    });
  });
});
