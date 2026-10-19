import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { RECAP_WEEK, SLEEPER_LEAGUE_NAME, SLEEPER_PAST } from '../fixtures/sleeper.js';
import { expect, test } from './fixtures.js';
import { openDashboard, openTab } from './helpers.js';

// Week 6's GB game hasn't kicked off in the fixtures, so week 5 is the latest finished week.
test.describe('Lineup recap', () => {
  test('shows what the best lineup would have scored, and the call that cost points', async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'History');
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await expect(recap.getByLabel('Week')).toHaveValue(String(RECAP_WEEK));

    const card = recap.getByRole('article', { name: new RegExp(`^${SLEEPER_LEAGUE_NAME}`) });
    const [me, opp] = SLEEPER_PAST[RECAP_WEEK - 1]!;
    await expect(card).toContainText(`Lost ${me.toFixed(1)}–${opp.toFixed(1)}`);
    // Najee Harris (26) on the bench, Jaylen Waddle (6.4) at FLEX.
    await expect(card).toContainText('Scored 101.1 of a possible 120.7 (84%): 19.6 left on the bench.');
    await expect(card.getByRole('note')).toHaveText('The best lineup (120.7) would have won this one.');
    await expect(card.getByRole('listitem').filter({ hasText: 'Najee Harris' }).first()).toContainText('FLEX: Najee Harris (26.0) over Jaylen Waddle (6.4)+19.6');
  });

  test('a league that fails to load doesn’t hide the others on the same platform', async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'History');
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await expect(recap).toContainText('espn:900002'); // the fixture league that always refuses
    await expect(recap.getByRole('article', { name: new RegExp(`^${ESPN_LEAGUE_NAME}`) })).toBeVisible();
  });

  test('can look back at an earlier week', async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'History');
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await recap.getByLabel('Week').selectOption('4');
    await expect(recap.getByLabel('Week')).toHaveValue('4');
    await expect(recap.getByRole('article', { name: new RegExp(`^${SLEEPER_LEAGUE_NAME}`) })).toBeVisible();
  });
});
