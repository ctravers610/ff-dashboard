import { expect, test } from './fixtures.js';
import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { FFPC_TEAM } from '../fixtures/ffpc.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
import { openDashboard, openTab } from './helpers.js';
import { seedFfpcLeague } from './seed.js';

// The Players tab lines up the same real-world player across three platforms that
// each use their own ids and name formats, and flags players on an opponent's team.
test.describe('Players tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedFfpcLeague(request);
    await openDashboard(page);
    await openTab(page, 'Players');
  });

  const row = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('listitem').filter({ hasText: name });

  test('lists a player once, with every league he is rostered in', async ({ page }) => {
    // Malik Nabers: a starter in Sleeper, ESPN and FFPC, which spell his name and ids differently.
    const nabers = row(page, 'Malik Nabers');
    await expect(nabers).toHaveCount(1);
    await expect(nabers).toContainText('WR · NYG');
    await expect(nabers).toContainText(SLEEPER_LEAGUE_NAME);
    await expect(nabers).toContainText(ESPN_LEAGUE_NAME);
    await expect(nabers).toContainText(FFPC_TEAM);
  });

  test('flags a player I start who an opponent is also starting against me', async ({ page }) => {
    // I start Josh Allen in Sleeper and FFPC; my ESPN opponent starts him this week.
    const allen = row(page, 'Josh Allen');
    await expect(allen).toContainText('Conflict');
    await expect(allen).toContainText(`vs ${ESPN_LEAGUE_NAME}`);
  });

  test('the Start & face filter shows only conflicts', async ({ page }) => {
    await page.getByRole('button', { name: /^Start & face/ }).click();
    await expect(row(page, 'Josh Allen')).toBeVisible();
    await expect(row(page, 'Malik Nabers')).toHaveCount(0); // shared, but nobody faces him
    await expect(page.getByText('Conflict').first()).toBeVisible();
  });

  test('the default filter hides players who are in only one league', async ({ page }) => {
    // Patrick Mahomes only ever appears as someone's opponent, so the default filter hides him.
    await expect(row(page, 'Patrick Mahomes')).toHaveCount(0);
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(row(page, 'Patrick Mahomes')).toHaveCount(1);
  });

  test('search narrows the list', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByPlaceholder('Search players').fill('nabe');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem')).toContainText('Malik Nabers');

    await page.getByPlaceholder('Search players').fill('zzzz');
    await expect(page.getByText('No players match.')).toBeVisible();
  });

  test('shows injury status next to a player', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(row(page, 'Jaylen Waddle')).toContainText('Questionable');
  });
});
