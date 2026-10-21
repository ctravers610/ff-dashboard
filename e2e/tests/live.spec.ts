import type { APIRequestContext, Page } from '@playwright/test';
import { ESPN_LEAGUE_NAME } from '@ffd/demo/fixtures/espn';
import { FFPC_TEAM } from '@ffd/demo/fixtures/ffpc';
import { PLAYERS as P } from '@ffd/demo/fixtures/players';
import { SLEEPER_LEAGUE_NAME } from '@ffd/demo/fixtures/sleeper';
import { UPSTREAM_PORT } from '../support/env.js';
import { expect, test } from './fixtures.js';
import { openDashboard } from './helpers.js';
import { seedFfpcLeague } from './seed.js';

// The live feed, beside the matchups on the main page, compares snapshots of
// the week's stat lines. No fixture game is live, so the automatic 30-second
// check is idle; these tests look with "Check now" and add plays to the fake
// stats feed in between.
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
    await expect(feed(page)).toContainText('No week 6 games are on right now.');
    await expect(feed(page)).toContainText('No scoring yet this week.');
  });

  test('shows a play once, scored by each league’s own rules', async ({ page, request }) => {
    await mayeThrowsATouchdown(request);
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

  test('sits beside the matchups, and filters to your starters or one league', async ({ page, request }) => {
    await mayeThrowsATouchdown(request);
    await request.post('/api/live/poll');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Matchups' })).toBeVisible(); // same page
    await expect(feed(page)).toContainText('Drake Maye');

    const show = feed(page).getByLabel('Show');
    await show.selectOption({ label: 'My starters' });
    await expect(feed(page)).toContainText('Drake Maye'); // he starts in ESPN
    await show.selectOption({ label: FFPC_TEAM });
    await expect(feed(page)).toContainText('Drake Maye');
  });
});
