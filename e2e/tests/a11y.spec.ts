import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { FFPC_LEAGUE } from '../fixtures/ffpc.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
import { openDashboard, openLeague, openTab } from './helpers.js';
import { seedFfpcLeague, waitForHistory } from './seed.js';

// Automated WCAG 2.1 A/AA checks (axe-core) over every screen (the app is dark-only).
// Automation only catches part of what matters for accessibility (roughly a third of
// issues), so these complement the keyboard and screen-reader behavior covered elsewhere.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, where: string) {
  // Buttons fade between colors; scanning mid-fade measures a color that is never at rest.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 4).map((n) => `    ${n.target.join(' ')}  →  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n')}`)
    .join('\n');
  expect(violations, `Accessibility violations on ${where}:\n${report}`).toEqual([]);
}

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedFfpcLeague(request);
    await waitForHistory(request, 3);
    await openDashboard(page);
  });

  test('Matchups', async ({ page }) => {
    await expectNoViolations(page, 'the Matchups tab');
  });

  test('Matchups with lineups and all-play open', async ({ page }) => {
    await (await openLeague(page, SLEEPER_LEAGUE_NAME)).getByRole('button', { name: 'Lineups' }).click();
    await (await openLeague(page, FFPC_LEAGUE)).getByRole('button', { name: 'All-play', exact: true }).click();
    await expectNoViolations(page, 'the Matchups tab (open rows)');
  });

  test('Waivers', async ({ page }) => {
    await openTab(page, 'Waivers');
    await expect(page.getByRole('heading', { name: 'Suggested moves' })).toBeVisible();
    await expectNoViolations(page, 'the Waivers tab');
  });

  test('Players', async ({ page }) => {
    await openTab(page, 'Players');
    await expect(page.getByRole('listitem').first()).toBeVisible();
    await expectNoViolations(page, 'the Players tab');
  });

  test('History chart', async ({ page }) => {
    await openTab(page, 'History');
    await expect(page.getByRole('img', { name: /your points each week/ }).first()).toBeVisible();
    await expectNoViolations(page, 'the History tab (charts)');
  });

  test('History table', async ({ page }) => {
    await openTab(page, 'History');
    await page.getByRole('button', { name: 'table', exact: true }).click();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expectNoViolations(page, 'the History tab (tables)');
  });

  test('Add/edit league dialog', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add FFPC league (manual roster)' }).click();
    await expect(page.getByRole('heading', { name: 'Add FFPC league' })).toBeVisible();
    await expectNoViolations(page, 'the add-league dialog');
  });
});

test.describe('Accessibility of the sign-in screen', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sign-in screen with the "not allowed" message', async ({ page }) => {
    await page.goto('/?login=denied');
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoViolations(page, 'the sign-in screen');
  });
});

test.describe('Accessibility on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Matchups with the bottom tab bar', async ({ page }) => {
    await openDashboard(page);
    await expectNoViolations(page, 'the Matchups tab on a phone');
  });
});
