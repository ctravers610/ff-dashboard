import type { Page } from '@playwright/test';
import { ESPN_LEAGUE_ID, ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { FRIEND_USERNAME, SLEEPER_USERNAME } from '../fixtures/sleeper.js';
import { FFPC_LEAGUE, FFPC_TEAM } from '../fixtures/ffpc.js';
import { expect, test } from './fixtures.js';
import { openDashboard } from './helpers.js';
import { seedFfpcLeague } from './seed.js';

// Adding Sleeper accounts and ESPN leagues from the dashboard. Each is checked
// against the platform before it's saved.
const dialog = (page: Page) => page.getByRole('dialog');
async function open(page: Page, platform: 'Sleeper' | 'ESPN') {
  await page.getByRole('button', { name: '+ Add league' }).click();
  await dialog(page).getByRole('button', { name: new RegExp(`^${platform}`) }).click();
}
const connected = (page: Page) => dialog(page).getByRole('region', { name: 'Connected accounts and leagues' }).getByRole('listitem');

test.describe('Adding leagues', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('lists what the dashboard follows, with .env entries marked and not removable', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add league' }).click();
    // Shown by name: "E2E Manager · 1 league in 2026" rather than the bare username.
    const sleeper = connected(page).filter({ hasText: 'E2E Manager · 1 league in 2026' });
    await expect(sleeper).toContainText('from .env');
    await expect(connected(page).filter({ hasText: ESPN_LEAGUE_NAME })).toContainText('from .env');
    await expect(sleeper.getByRole('button', { name: /Remove/ })).toHaveCount(0);
  });

  test('adds a Sleeper account after checking it exists, and can remove it again', async ({ page }) => {
    await open(page, 'Sleeper');
    await dialog(page).getByLabel('Sleeper username').fill(FRIEND_USERNAME);
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('status')).toHaveText('Added E2E Friend · 0 leagues in 2026.');

    const row = connected(page).filter({ hasText: 'E2E Friend' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Remove E2E Friend · 0 leagues in 2026' }).click();
    await expect(row).toHaveCount(0);
  });

  test('says so when a Sleeper username doesn’t exist, or is already there', async ({ page }) => {
    await open(page, 'Sleeper');
    const field = dialog(page).getByLabel('Sleeper username');
    await field.fill('no_such_person');
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('There\'s no Sleeper user named "no_such_person".');

    await field.fill(SLEEPER_USERNAME.toUpperCase()); // usernames aren't case-sensitive
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('is already on your dashboard');
  });

  test('takes an ESPN league by its address, and reports a league it can’t read', async ({ page }) => {
    await open(page, 'ESPN');
    const field = dialog(page).getByLabel('ESPN league address or id');
    await field.fill(`https://fantasy.espn.com/football/league?leagueId=${ESPN_LEAGUE_ID}`);
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText(`${ESPN_LEAGUE_NAME} is already on your dashboard.`);

    await field.fill('900003'); // no such league
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('ESPN league 900003 returned HTTP 404');

    await field.fill('not a league');
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('it contains leagueId=');
  });

  test('lists FFPC leagues by team, and Edit opens that league’s editor', async ({ page, request }) => {
    await seedFfpcLeague(request);
    await page.reload();
    await page.getByRole('button', { name: '+ Add league' }).click();
    const row = connected(page).filter({ hasText: FFPC_TEAM });
    await expect(row).toContainText(`FFPC ${FFPC_TEAM} · ${FFPC_LEAGUE}`);
    await row.getByRole('button', { name: `Edit ${FFPC_TEAM}` }).click();
    await expect(page.getByRole('heading', { name: 'Edit FFPC roster' })).toBeVisible();
  });

  test('Escape closes the dialog', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add league' }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });
});
