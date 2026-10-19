import type { APIRequestContext, Page } from '@playwright/test';
import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { FFPC_TEAM } from '../fixtures/ffpc.js';
import { PLAYERS as P } from '../fixtures/players.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
import { UPSTREAM_PORT } from '../support/env.js';
import { expect, test } from './fixtures.js';
import { openDashboard, openTab } from './helpers.js';
import { seedFfpcLeague } from './seed.js';

// The live feed compares snapshots of the week's stat lines. The fixture games
// are all final, so the automatic 30-second check is idle; these tests look
// with "Check now" and add plays to the fake stats feed in between.
const upstream = (path: string) => fetch(`http://127.0.0.1:${UPSTREAM_PORT}${path}`, { method: 'POST' });
const feed = (page: Page) => page.getByRole('region', { name: 'Live scoring' });

// Drake Maye throws a 25-yard touchdown. He's on the bench in Sleeper and FFPC
// and starts in ESPN, so one play shows every kind of league chip.
async function mayeThrowsATouchdown(request: APIRequestContext) {
  await request.post('/api/live/poll'); // the starting point
  await upstream(`/_live/play?player=${P.maye.id}&pass_td=1&pass_yd=25`);
}

test.describe('Live feed', () => {
  test.beforeEach(async ({ page, request }) => {
    await upstream('/_live/reset');
    await seedFfpcLeague(request);
    await openDashboard(page);
  });
  test.afterEach(async () => {
    await upstream('/_live/reset'); // other tests score the real fixture stats
  });

  test('is quiet when nothing is on', async ({ page }) => {
    await openTab(page, 'Live');
    await expect(feed(page)).toContainText('No week 6 games are on right now.');
    await expect(feed(page)).toContainText('No scoring yet this week.');
  });

  test('shows a play once, scored by each league’s own rules', async ({ page, request }) => {
    await mayeThrowsATouchdown(request);
    await openTab(page, 'Live');
    await feed(page).getByRole('button', { name: 'Check now' }).click();

    const event = feed(page).getByRole('listitem').filter({ hasText: 'Drake Maye' }).first();
    await expect(event).toContainText('QB · NE 1 pass TD, 25 pass yds');
    const chips = event.getByRole('list', { name: 'Points by league' });
    await expect(chips).toContainText(`+5.0 ${SLEEPER_LEAGUE_NAME} · bench`); // 4 + 25 × 0.04
    await expect(chips).toContainText(`+5.3 ${FFPC_TEAM} · bench`); // FFPC: 4 + 25 × 0.05
    await expect(chips).toContainText(`ESPN catching up ${ESPN_LEAGUE_NAME}`); // ESPN's own total hasn't moved yet

    // Checking again with nothing new adds nothing.
    await feed(page).getByRole('button', { name: 'Check now' }).click();
    await expect(feed(page).getByRole('listitem').filter({ hasText: 'Drake Maye' })).toHaveCount(1);
  });

  test('filters to one league, and the Matchups tab shows the latest scoring', async ({ page, request }) => {
    await mayeThrowsATouchdown(request);
    await request.post('/api/live/poll');
    await page.reload();

    const latest = page.getByRole('region', { name: 'Latest scoring' });
    await expect(latest).toContainText('Drake Maye');
    await latest.getByRole('button', { name: 'See all' }).click();

    await feed(page).getByRole('group', { name: 'Show' }).getByRole('button', { name: 'My starters' }).click();
    await expect(feed(page)).toContainText('Drake Maye'); // he starts in ESPN
    await feed(page).getByRole('group', { name: 'Show' }).getByRole('button', { name: FFPC_TEAM }).click();
    await expect(feed(page)).toContainText('Drake Maye');
  });
});
