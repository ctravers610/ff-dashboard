import { ESPN_MY_TEAM } from '@ffd/demo/fixtures/espn';
import { SLEEPER_MY_TEAM } from '@ffd/demo/fixtures/sleeper';
import { expect, test } from './fixtures.js';
import { openDashboard, openLeague, openTab, showLeague, sideListEntry } from './helpers.js';

// Both fixture leagues have a short season left (weeks 6 and 7, top 2 of 4 make
// the playoffs), and week 6's games have kicked off, so the preview is week 7.
test.describe('Season outlook', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('a league’s details preview next week’s opponent and show the playoff chance', async ({ page }) => {
    const details = await openLeague(page, SLEEPER_MY_TEAM);
    const next = details.getByRole('region', { name: 'Up next' });
    await expect(next).toContainText('Week 7 vs Third Wheel');
    await expect(next).toContainText('4-1, 1st'); // the best record in the league
    await expect(next).toContainText(/\d+% to win/);
    await expect(details).toContainText(/Playoffs (\d+|<1|>99)%/);
  });

  test('ESPN: next week’s opponent comes from the league schedule', async ({ page }) => {
    const details = await openLeague(page, ESPN_MY_TEAM);
    await expect(details.getByRole('region', { name: 'Up next' })).toContainText('Week 7 vs Third Place Finish');
  });

  test('History shows each league’s playoff chance', async ({ page }) => {
    await openTab(page, 'History');
    await expect(sideListEntry(page, SLEEPER_MY_TEAM)).toContainText(/% playoffs/);
    const card = await showLeague(page, SLEEPER_MY_TEAM);
    await expect(card).toContainText(/Playoff chance(\d+|<1|>99)%~\d+\.\d wins/);
  });

  test('History shows how lucky every team has been, and the season awards', async ({ page }) => {
    await openTab(page, 'History');
    await showLeague(page, SLEEPER_MY_TEAM);
    const luck = page.getByRole('region', { name: 'Luck' });
    await expect(luck.getByRole('row')).toHaveCount(5); // header + 4 teams
    await expect(luck.getByRole('row').filter({ hasText: '(you)' })).toContainText('3-2'); // weeks 1-5
    const awards = page.getByRole('region', { name: 'Season awards' });
    for (const title of ['Highest score', 'Biggest blowout', 'Heartbreaker']) await expect(awards).toContainText(title);
  });
});
