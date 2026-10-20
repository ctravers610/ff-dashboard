import type { WaiverLeague } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { awake, dueFfpcPasteIssues, ffpcPasteMessage } from './ffpcPaste.js';

// FFPC's bids: Wednesday 11 PM and Sunday 10 AM Eastern. Week of 2026-10-21 (EDT, UTC-4).
const runs = [
  { day: 3, time: '23:00' },
  { day: 0, time: '10:00' },
];
const ffpc = (pastedAt: string | null): WaiverLeague => ({
  leagueId: 'f1',
  platform: 'ffpc',
  name: 'Club 223',
  rules: null,
  moves: [],
  available: [],
  openRosterSpots: 0,
  pastedAt,
  runs,
  runsSource: 'ffpc',
  claims: null,
});
const current = { week: 7, capturedAt: '2026-10-25T14:30:00Z' }; // Sunday 10:30 AM, after the bids
const due = (league: WaiverLeague, now: string, lineup: { week: number; capturedAt: string } | null = current) =>
  dueFfpcPasteIssues([league], new Map([['f1', lineup && { week: lineup.week, capturedAt: new Date(lineup.capturedAt) }]]), '2026', 7, new Date(now));

describe('awake', () => {
  it('moves an overnight time to 8 AM Eastern', () => {
    expect(awake(new Date('2026-10-22T04:00:00Z')).toISOString()).toBe('2026-10-22T12:00:00.000Z'); // Thu 12 AM -> 8 AM EDT
    expect(awake(new Date('2026-10-22T03:30:00Z')).toISOString()).toBe('2026-10-22T12:00:00.000Z'); // Wed 11:30 PM -> Thu 8 AM
    expect(awake(new Date('2026-10-22T15:00:00Z')).toISOString()).toBe('2026-10-22T15:00:00.000Z'); // Thu 11 AM stays
  });
});

describe('dueFfpcPasteIssues', () => {
  const tuesdayPaste = ffpc('2026-10-20T16:00:00Z');

  it('asks for a new add/drop paste the morning after the Wednesday night bids', () => {
    expect(due(tuesdayPaste, '2026-10-22T05:00:00Z')).toEqual([]); // Thu 1 AM: overnight, waits
    const [issue] = due(tuesdayPaste, '2026-10-22T12:05:00Z'); // Thu 8:05 AM
    expect(issue).toMatchObject({ page: 'add-drop', key: 'ffpc-paste:add-drop:f1:2026-10-22T03:00:00.000Z' });
  });

  it('is quiet once the page has been pasted since the run', () => {
    expect(due(ffpc('2026-10-22T11:00:00Z'), '2026-10-22T12:05:00Z')).toEqual([]);
  });

  it('asks for the Live Scoring page on Sunday morning if the lineup predates the 10 AM bids', () => {
    const pastedToday = ffpc('2026-10-25T14:30:00Z'); // add/drop pasted after the Sunday bids
    expect(due(pastedToday, '2026-10-25T15:30:00Z', { week: 7, capturedAt: '2026-10-23T12:00:00Z' })).toMatchObject([{ page: 'live-scoring' }]); // Sun 11:30 AM
    expect(due(pastedToday, '2026-10-25T15:30:00Z')).toEqual([]); // lineup pasted 10:30 AM: current
    expect(due(pastedToday, '2026-10-25T15:30:00Z', null)).toMatchObject([{ page: 'live-scoring' }]); // never pasted this week
    expect(due(pastedToday, '2026-10-25T18:00:00Z', null)).toEqual([]); // 2 PM: games are on, too late
  });
});

describe('ffpcPasteMessage', () => {
  it('names the league and the page to paste, and links to its waivers', () => {
    const msg = ffpcPasteMessage([{ key: 'k', leagueId: 'f1', leagueName: 'Club 223', page: 'add-drop' }]);
    expect(msg.title).toBe('Club 223: FFPC paste is out of date');
    expect(msg.body).toContain('paste the add/drop page for Club 223');
    expect(msg.url).toBe('/?view=waivers&league=ffpc%3Af1');
  });
});
