import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { FFPC_LEAGUE } from '../fixtures/ffpc.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
import { leagueCard, openDashboard, openTab } from './helpers.js';
import { seedFfpcLeague, waitForHistory } from './seed.js';

// Automated WCAG 2.1 A/AA checks (axe-core) over every screen, in light and dark mode.
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

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Accessibility (${colorScheme} mode)`, () => {
    test.beforeEach(async ({ page, request }) => {
      await seedFfpcLeague(request);
      await waitForHistory(request, 3);
      await page.emulateMedia({ colorScheme });
      await openDashboard(page);
    });

    test('Leagues', async ({ page }) => {
      await expectNoViolations(page, 'the Leagues tab');
    });

    test('Leagues with lineups, standings and all-play expanded', async ({ page }) => {
      await leagueCard(page, SLEEPER_LEAGUE_NAME).getByRole('button', { name: 'Lineups' }).click();
      await leagueCard(page, FFPC_LEAGUE).getByRole('button', { name: 'All-play' }).click();
      await expectNoViolations(page, 'the Leagues tab (expanded)');
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
}
