import { convertFfpcLivePage } from '@ffd/shared';
import { expect, type APIRequestContext } from '@playwright/test';
import { livePage } from '../fixtures/ffpc.js';

/**
 * Creates the fixture FFPC league through the API, built by the same converter the
 * paste box uses, so tests that are about something else don't have to click
 * through the import dialog first.
 */
export async function seedFfpcLeague(request: APIRequestContext) {
  const imported = convertFfpcLivePage(livePage());
  if (!imported) throw new Error('The fixture page was not recognized as an FFPC Live Scoring page');

  const res = await request.post('/api/manual-leagues', {
    data: {
      name: imported.leagueName,
      teamName: imported.teamName,
      rosterText: imported.rosterText,
      matchup: imported.matchup,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

/** History snapshots are written in the background after a dashboard load; wait for them. */
export async function waitForHistory(request: APIRequestContext, leagues: number, weeksForSleeper = 6) {
  await request.get('/api/dashboard');
  await expect
    .poll(
      async () => {
        const history = (await (await request.get('/api/history')).json()) as {
          leagues: { platform: string; weeks: unknown[] }[];
        };
        const sleeper = history.leagues.find((l) => l.platform === 'sleeper');
        return history.leagues.length === leagues && sleeper?.weeks.length === weeksForSleeper;
      },
      { message: 'history snapshots and backfill should be written', timeout: 15_000 },
    )
    .toBe(true);
}
