import type { WaiverLeague } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { dueReminders, reminderKey, reminderMessage, remindAt, type ReminderState } from './plan.js';

const iso = (d: Date) => d.toISOString();

describe('remindAt', () => {
  it('reminds at 9 PM Eastern the evening before an overnight run', () => {
    // Wednesday Oct 21, 3:00 AM EDT → Tuesday Oct 20, 9:00 PM EDT
    expect(iso(remindAt({ day: 3, time: '03:00' }, new Date('2026-10-21T07:00:00Z')))).toBe('2026-10-21T01:00:00.000Z');
  });

  it('handles a run just after midnight', () => {
    // Thursday 12:30 AM → Wednesday 9 PM
    expect(iso(remindAt({ day: 4, time: '00:30' }, new Date('2026-10-22T04:30:00Z')))).toBe('2026-10-22T01:00:00.000Z');
  });

  it('reminds 2 hours ahead of a daytime or evening run', () => {
    expect(iso(remindAt({ day: 3, time: '23:00' }, new Date('2026-10-22T03:00:00Z')))).toBe('2026-10-22T01:00:00.000Z'); // Wed 9 PM
    expect(iso(remindAt({ day: 0, time: '10:00' }, new Date('2026-10-25T14:00:00Z')))).toBe('2026-10-25T12:00:00.000Z'); // Sun 8 AM
  });
});

const league = (over: Partial<WaiverLeague> = {}): WaiverLeague => ({
  leagueId: 'L1',
  platform: 'sleeper',
  name: 'Test League',
  rules: null,
  moves: [],
  available: [],
  openRosterSpots: 0,
  runs: [{ day: 3, time: '03:00' }], // Tue night
  runsSource: 'history',
  claims: null,
  ...over,
});

describe('dueReminders', () => {
  const runAt = new Date('2026-10-21T07:00:00Z'); // Wed 3 AM EDT
  const before = new Date('2026-10-21T00:30:00Z'); // Tue 8:30 PM
  const during = new Date('2026-10-21T01:05:00Z'); // Tue 9:05 PM
  const none = new Map<string, ReminderState>();

  it('is quiet before the reminder time, and due from then until the run', () => {
    expect(dueReminders([league()], none, before)).toEqual([]);
    expect(dueReminders([league()], none, during).map((d) => iso(d.runAt))).toEqual([iso(runAt)]);
  });

  it('skips a run already reminded about, or one you marked as set', () => {
    const key = reminderKey('sleeper', 'L1', runAt);
    expect(dueReminders([league()], new Map([[key, { claimsSetAt: null, remindedAt: during }]]), during)).toEqual([]);
    expect(dueReminders([league()], new Map([[key, { claimsSetAt: before, remindedAt: null }]]), during)).toEqual([]);
  });

  it('skips a league whose claims are already in (ESPN shows your pending claims)', () => {
    const claims = { runAt: iso(runAt), set: true, source: 'espn' as const, pending: 2 };
    expect(dueReminders([league({ platform: 'espn', claims })], none, during)).toEqual([]);
  });

  it('skips leagues with no known schedule', () => {
    expect(dueReminders([league({ runs: [], runsSource: null })], none, during)).toEqual([]);
  });
});

describe('reminderMessage', () => {
  it('names the league, says when, and points at the waivers', () => {
    const move = {
      slot: 'TE',
      reason: 'upgrade' as const,
      replaces: null,
      add: { player: { playerId: '1', name: 'Mark Andrews', position: 'TE', nflTeam: 'BAL', injuryStatus: null }, week: 11, restOfSeason: 120, availability: null, trendingAdds: null },
      drop: null,
      gain: 3.2,
    };
    const message = reminderMessage({ league: league({ moves: [move] }), run: { day: 3, time: '03:00' }, runAt: new Date('2026-10-21T07:00:00Z') });
    expect(message).toMatchObject({
      title: 'Test League: waivers Tue night',
      body: 'Claims process Tue night (Wed 3:00 AM) ET. 1 suggested move: add Mark Andrews.',
      url: '/?view=waivers&league=sleeper%3AL1',
      tag: 'waivers:sleeper:L1',
      runAt: '2026-10-21T07:00:00.000Z',
    });
  });

  it('says "in 2 hours" for a daytime run', () => {
    const message = reminderMessage({ league: league({ platform: 'ffpc', name: 'Club 223' }), run: { day: 3, time: '23:00' }, runAt: new Date('2026-10-22T03:00:00Z') });
    expect(message.title).toBe('Club 223: waivers in 2 hours');
    expect(message.body).toBe('Claims process Wed 11:00 PM ET. No suggested moves.');
  });
});
