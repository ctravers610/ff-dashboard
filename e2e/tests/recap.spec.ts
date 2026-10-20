import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { RECAP_WEEK, SLEEPER_LEAGUE_NAME, SLEEPER_PAST } from '../fixtures/sleeper.js';
import { expect, test } from './fixtures.js';
import { openDashboard, openTab, showLeague } from './helpers.js';

// Each league's recap sits under its results on the History tab. Week 6's GB game
// hasn't kicked off in the fixtures, so week 5 is the latest finished week.
test.describe('Lineup recap', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'History');
  });

  test('shows what the best lineup would have scored, and the call that cost points', async ({ page }) => {
    await showLeague(page, SLEEPER_LEAGUE_NAME);
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await expect(recap.getByLabel('Week')).toHaveValue(String(RECAP_WEEK));

    const [me, opp] = SLEEPER_PAST[RECAP_WEEK - 1]!;
    await expect(recap).toContainText(`Lost ${me.toFixed(1)}–${opp.toFixed(1)}`);
    // Najee Harris (26) on the bench, Jaylen Waddle (6.4) at FLEX.
    await expect(recap).toContainText('Scored 101.1 of a possible 120.7 (84%): 19.6 left on the bench.');
    await expect(recap.getByRole('note')).toHaveText('The best lineup (120.7) would have won this one.');
    await expect(recap.getByRole('listitem').filter({ hasText: 'Najee Harris' }).first()).toContainText('FLEX: Najee Harris (26.0) over Jaylen Waddle (6.4)+19.6');
  });

  test('a league that fails to load doesn’t hide the others on the same platform', async ({ page }) => {
    // The fixture's second ESPN league always refuses; this one still has its recap.
    await showLeague(page, ESPN_LEAGUE_NAME);
    await expect(page.getByRole('region', { name: 'Lineup recap' })).toContainText(/^Lineup recap.*Won /);
  });

  test('can look back at an earlier week, and keeps that week when switching leagues', async ({ page }) => {
    await showLeague(page, SLEEPER_LEAGUE_NAME);
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await recap.getByLabel('Week').selectOption('4');
    const [me, opp] = SLEEPER_PAST[3]!;
    await expect(recap).toContainText(`Won ${me.toFixed(1)}–${opp.toFixed(1)}`);
    await showLeague(page, ESPN_LEAGUE_NAME);
    await expect(recap.getByLabel('Week')).toHaveValue('4');
  });

  test('clicking a week’s column in the chart shows that week’s recap', async ({ page }) => {
    const card = await showLeague(page, SLEEPER_LEAGUE_NAME);
    const recap = page.getByRole('region', { name: 'Lineup recap' });
    await card.locator('.recharts-bar-rectangle').nth(3).click(); // week 4
    await expect(recap.getByLabel('Week')).toHaveValue('4');
    const [me, opp] = SLEEPER_PAST[3]!;
    await expect(recap).toContainText(`Won ${me.toFixed(1)}–${opp.toFixed(1)}`);
  });

  test('the table view’s week numbers pick the recap week too', async ({ page }) => {
    const card = await showLeague(page, SLEEPER_LEAGUE_NAME);
    await card.getByRole('button', { name: 'table', exact: true }).click();
    await card.getByRole('button', { name: 'Show the week 3 recap' }).click();
    await expect(page.getByRole('region', { name: 'Lineup recap' }).getByLabel('Week')).toHaveValue('3');
    await expect(card.getByRole('button', { name: 'Show the week 3 recap' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('counts the losses a better lineup would have won this season', async ({ page }) => {
    const card = await showLeague(page, SLEEPER_LEAGUE_NAME);
    // Week 5: lost, but the best lineup (120.7) beat the opponent.
    await expect(card).toContainText('Losses a better lineup wins');
    await card.getByRole('button', { name: `Show the week ${RECAP_WEEK} recap` }).click();
    await expect(page.getByRole('region', { name: 'Lineup recap' }).getByRole('note')).toHaveText('The best lineup (120.7) would have won this one.');
  });
});
