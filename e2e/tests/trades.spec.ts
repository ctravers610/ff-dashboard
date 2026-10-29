import { ESPN_MY_TEAM } from '@ffd/demo/fixtures/espn';
import { SLEEPER_MY_TEAM } from '@ffd/demo/fixtures/sleeper';
import { expect, test } from './fixtures.js';
import { openDashboard, openTab, showLeague } from './helpers.js';

// The fixture trade (fixtures/waivers.ts): week 5, Najee Harris and $10 of FAAB
// to you for Tee Higgins and a 2027 2nd. Week 5 is the only finished week since.
test.describe('Trades', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'History');
  });

  test('lists a league’s trades with what each side got and how it has gone', async ({ page }) => {
    await showLeague(page, SLEEPER_MY_TEAM);
    const trades = page.getByRole('region', { name: 'Trades' });
    const trade = trades.getByRole('listitem').first();
    await expect(trade).toContainText('Week 5');
    await expect(trade).toContainText('Najee Harris RB26.0 pts · started 0 of 1 week');
    await expect(trade).toContainText('$10 FAAB');
    await expect(trade).toContainText('Tee Higgins WR');
    await expect(trade).toContainText('2027 round 2');
    await expect(trade).toContainText('(you)');
    await expect(trade).toContainText('Even so far.');
  });

  test('says when a league’s trades can’t be read', async ({ page }) => {
    await showLeague(page, ESPN_MY_TEAM);
    await expect(page.getByRole('region', { name: 'Trades' })).toContainText('Trades can only be read from Sleeper leagues for now.');
  });

  test('the trade finder looks for deals in Sleeper and ESPN leagues', async ({ page }) => {
    for (const name of [SLEEPER_MY_TEAM, ESPN_MY_TEAM]) {
      await showLeague(page, name);
      const finder = page.getByRole('region', { name: 'Trade finder' });
      // Either ideas or an honest "none"; never an error.
      await expect(finder.getByRole('listitem').first().or(finder.getByText('No trade helps both lineups right now.'))).toBeVisible();
      await expect(finder).not.toContainText("Couldn't");
    }
  });
});
