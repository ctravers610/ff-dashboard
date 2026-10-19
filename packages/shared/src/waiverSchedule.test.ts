import { describe, expect, it } from 'vitest';
import { describeRun, easternTime, friendlyRun, friendlyRunWithTime, inferWaiverRuns, nextRun, nextWaiverRun, parseFfpcBidSchedule } from './waiverSchedule';

describe('easternTime', () => {
  it('converts New York wall-clock time, in daylight and standard time', () => {
    expect(easternTime(2026, 10, 21, 23, 0).toISOString()).toBe('2026-10-22T03:00:00.000Z'); // EDT, UTC-4
    expect(easternTime(2026, 12, 2, 3, 0).toISOString()).toBe('2026-12-02T08:00:00.000Z'); // EST, UTC-5
  });
});

describe('nextWaiverRun', () => {
  // Monday, October 19 2026, 3:00 PM Eastern.
  const now = new Date('2026-10-19T19:00:00Z');
  const wednesday11pm = { day: 3, time: '23:00' };
  const sunday10am = { day: 0, time: '10:00' };

  it('finds the next run this week', () => {
    expect(nextWaiverRun([wednesday11pm, sunday10am], now)?.toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });

  it('wraps to next week once this week’s run has passed', () => {
    expect(nextWaiverRun([{ day: 1, time: '10:00' }], now)?.toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(nextWaiverRun([sunday10am], now)?.toISOString()).toBe('2026-10-25T14:00:00.000Z');
  });

  it('takes a run later today', () => {
    expect(nextWaiverRun([{ day: 1, time: '18:30' }], now)?.toISOString()).toBe('2026-10-19T22:30:00.000Z');
  });

  it('is null with no runs', () => {
    expect(nextWaiverRun([], now)).toBeNull();
  });
});

describe('parseFfpcBidSchedule', () => {
  it('reads FFPC’s wording', () => {
    expect(parseFfpcBidSchedule('Wednesdays at 11 pm ET and Sundays at 10 am ET')).toEqual([
      { day: 3, time: '23:00' },
      { day: 0, time: '10:00' },
    ]);
    expect(parseFfpcBidSchedule('Thursdays at 12:30 am ET')).toEqual([{ day: 4, time: '00:30' }]);
  });
});

describe('describeRun', () => {
  it('formats a run for display', () => {
    expect(describeRun({ day: 3, time: '23:00' })).toBe('Wed 11:00 PM');
    expect(describeRun({ day: 4, time: '00:30' })).toBe('Thu 12:30 AM');
  });
});

describe('inferWaiverRuns', () => {
  const at = (iso: string, n = 1) => Array.from({ length: n }, () => new Date(iso));

  it('finds the weekly run from processed claims, ignoring one-off stragglers', () => {
    const claims = [
      ...at('2026-09-16T07:10:00Z', 5), // Wed 3:10 AM EDT
      ...at('2026-09-23T07:08:00Z', 4), // Wed 3:08 AM
      ...at('2026-09-25T14:57:00Z', 1), // a Friday afternoon one-off
    ];
    expect(inferWaiverRuns(claims)).toEqual([{ day: 3, time: '03:00' }]);
  });

  it('keeps every day that carries a real share of the claims', () => {
    const claims = [...at('2026-10-01T07:40:00Z', 6), ...at('2026-10-04T14:05:00Z', 4)]; // Thu 3:40 AM, Sun 10:05 AM
    expect(inferWaiverRuns(claims)).toEqual([
      { day: 0, time: '10:00' },
      { day: 4, time: '03:30' },
    ]);
  });

  it('ignores claims scattered through a day: that’s players clearing waivers one by one, not a run', () => {
    const claims = [
      ...at('2026-09-16T07:06:00Z', 4), // Wed 3:06 AM
      ...at('2026-09-23T07:07:00Z', 3), // Wed 3:07 AM
      ...at('2026-09-25T14:57:00Z', 3), // Fri 10:57 AM
      ...at('2026-09-25T19:57:00Z', 3), // Fri 3:57 PM
    ];
    expect(inferWaiverRuns(claims)).toEqual([{ day: 3, time: '03:00' }]);
  });

  it('is empty without enough history', () => {
    expect(inferWaiverRuns(at('2026-10-01T07:40:00Z', 2))).toEqual([]);
  });
});

describe('friendlyRun', () => {
  it('calls an overnight run the night before', () => {
    expect(friendlyRun({ day: 3, time: '03:00' })).toBe('Tue night');
    expect(friendlyRunWithTime({ day: 3, time: '03:00' })).toBe('Tue night (Wed 3:00 AM)');
    expect(friendlyRun({ day: 0, time: '00:30' })).toBe('Sat night');
  });

  it('leaves daytime and evening runs as they are', () => {
    expect(friendlyRun({ day: 3, time: '23:00' })).toBe('Wed 11:00 PM');
    expect(friendlyRunWithTime({ day: 0, time: '10:00' })).toBe('Sun 10:00 AM');
  });
});

describe('nextRun', () => {
  it('says which run is next, not just when', () => {
    const runs = [{ day: 3, time: '23:00' }, { day: 0, time: '10:00' }];
    expect(nextRun(runs, new Date('2026-10-19T19:00:00Z'))?.run).toEqual({ day: 3, time: '23:00' });
  });
});
