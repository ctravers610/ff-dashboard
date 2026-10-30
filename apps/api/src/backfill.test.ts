import type { LeagueSummary } from '@ffd/shared';
import { describe, expect, it, vi } from 'vitest';
import { ffpcPastWeeks } from './adapters/manual/history.js';
import { sleeperPastWeeks } from './adapters/sleeper/history.js';
import { backfillHistory, weeksToFetch } from './backfill.js';
import type { NewSnapshot } from './db/schema.js';
import type { snapshotRepo } from './snapshots.js';

vi.mock('./adapters/sleeper/history.js', () => ({
  sleeperPastWeeks: vi.fn(async (league: LeagueSummary, weeks: number[]) =>
    weeks.map((week): NewSnapshot => ({ platform: 'sleeper', leagueId: league.leagueId, leagueName: league.name, season: league.season, week, points: 134.4, opponentPoints: 120.5 })),
  ),
}));

vi.mock('./adapters/manual/history.js', () => ({
  ffpcPastWeeks: vi.fn(async (league: LeagueSummary): Promise<NewSnapshot[]> => [
    { platform: 'ffpc', leagueId: league.leagueId, leagueName: league.name, season: league.season, week: 7, points: 120, estimated: true },
  ]),
}));

const at = (iso: string) => new Date(iso);

describe('weeksToFetch', () => {
  it('lists earlier weeks that have no snapshot yet', () => {
    const after = at('2026-10-28T12:00:00Z');
    expect(weeksToFetch('2026', 6, [{ week: 6, capturedAt: after }])).toEqual([1, 2, 3, 4, 5]);
    expect(weeksToFetch('2026', 6, [2, 3, 6].map((week) => ({ week, capturedAt: after })))).toEqual([1, 4, 5]);
    expect(weeksToFetch('2026', 1, [])).toEqual([]);
  });

  it('refetches a week captured before it ended, not one captured after', () => {
    const captures = [
      { week: 5, capturedAt: at('2026-10-14T01:00:00Z') }, // the Wednesday after week 5: final
      { week: 6, capturedAt: at('2026-10-19T02:00:00Z') }, // Sunday night of week 6
      { week: 7, capturedAt: at('2026-10-22T20:00:00Z') }, // Thursday of week 7, before kickoff
      { week: 8, capturedAt: at('2026-10-29T12:00:00Z') }, // the current week: recorded live
    ];
    expect(weeksToFetch('2026', 8, captures)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(weeksToFetch('2026', 8, [...captures, ...[1, 2, 3, 4].map((week) => ({ week, capturedAt: at('2026-10-14T01:00:00Z') }))])).toEqual([6, 7]);
  });
});

describe('backfillHistory', () => {
  const league = { platform: 'sleeper', leagueId: 'S9', name: 'Sleeper League', season: '2026', week: 8 } as LeagueSummary;
  const fakeStore = (captures: { week: number; capturedAt: Date }[]) =>
    ({ capturesFor: vi.fn().mockResolvedValue(captures), saveFinal: vi.fn().mockResolvedValue(undefined) }) as unknown as typeof snapshotRepo;
  const final = [1, 2, 3, 4, 5, 6].map((week) => ({ week, capturedAt: at('2026-10-21T12:00:00Z') }));
  const now = Date.parse('2026-10-29T12:00:00Z');

  it('refetches a stale week and saves it over the old row', async () => {
    const store = fakeStore([...final, { week: 7, capturedAt: at('2026-10-22T20:00:00Z') }]);
    await backfillHistory([league], store, now);
    expect(sleeperPastWeeks).toHaveBeenLastCalledWith(league, [7]);
    expect((store.saveFinal as ReturnType<typeof vi.fn>).mock.calls[0]![0].map((r: NewSnapshot) => [r.week, r.points])).toEqual([[7, 134.4]]);
  });

  it('checks a league at most once an hour', async () => {
    const other = { ...league, leagueId: 'S10' };
    const store = fakeStore([...final, { week: 7, capturedAt: at('2026-10-22T20:00:00Z') }]);
    await backfillHistory([other], store, now);
    await backfillHistory([other], store, now + 10 * 60_000);
    await backfillHistory([other], store, now + 61 * 60_000);
    expect(store.capturesFor).toHaveBeenCalledTimes(2);
  });

  it("re-scores an FFPC league's finished weeks from its pastes", async () => {
    const ffpc = { ...league, platform: 'ffpc', leagueId: 'F1' } as LeagueSummary;
    const captures = [...final, { week: 7, capturedAt: at('2026-10-25T20:00:00Z') }];
    const store = fakeStore(captures);
    await backfillHistory([ffpc], store, now);
    expect(store.capturesFor).toHaveBeenCalledWith('ffpc', 'F1', '2026');
    expect(ffpcPastWeeks).toHaveBeenLastCalledWith(ffpc, [7], captures);
    expect((store.saveFinal as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject([{ week: 7, estimated: true }]);
  });

  it('still looks at FFPC pastes when every week has a final score: one may have been pasted since', async () => {
    const ffpc = { ...league, platform: 'ffpc', leagueId: 'F2' } as LeagueSummary;
    await backfillHistory([ffpc], fakeStore([...final, { week: 7, capturedAt: at('2026-10-28T12:00:00Z') }]), now);
    expect(ffpcPastWeeks).toHaveBeenLastCalledWith(ffpc, [], expect.any(Array));
  });
});
