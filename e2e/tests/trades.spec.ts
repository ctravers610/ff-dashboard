import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
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
    await showLeague(page, SLEEPER_LEAGUE_NAME);
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
    await showLeague(page, ESPN_LEAGUE_NAME);
    await expect(page.getByRole('region', { name: 'Trades' })).toContainText('Trades can only be read from Sleeper leagues for now.');
  });
});
