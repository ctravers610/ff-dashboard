import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { ESPN_LEAGUE_NAME, ESPN_PAST } from '../fixtures/espn.js';
import { FFPC_LEAGUE, FFPC_TEAM } from '../fixtures/ffpc.js';
import { SLEEPER_LEAGUE_NAME, SLEEPER_PAST } from '../fixtures/sleeper.js';
import { leagueCard, openDashboard, openTab, pts } from './helpers.js';
import { seedFfpcLeague, waitForHistory } from './seed.js';

// Weeks 1-5 of the Sleeper and ESPN leagues are rebuilt from their own history the
// first time the dashboard loads; week 6 is recorded live. All of it goes through
// the real database.
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);

const resultWord = (mine: number, theirs: number) => (mine > theirs ? 'win' : 'loss');
const expectedTitles = (past: [number, number, ...unknown[]][]) => [
  ...past.map(([mine, theirs], i) => `Week ${i + 1}: ${resultWord(mine, theirs)}`),
  'Week 6: in progress',
];

const chipTitles = (card: ReturnType<typeof leagueCard>) =>
  card.locator('[aria-label="Weekly results"] [title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')));

async function openHistory(page: Page) {
  await openDashboard(page);
  await openTab(page, 'History');
  await expect(page.getByText('Loading history…')).toBeHidden();
}

test.describe('History tab', () => {
  test.beforeEach(async ({ request }) => {
    await seedFfpcLeague(request);
    await waitForHistory(request, 3);
  });

  test('rebuilds finished Sleeper weeks and records the live one', async ({ page }) => {
    await openHistory(page);
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);

    expect(await chipTitles(card)).toEqual(expectedTitles(SLEEPER_PAST)); // W L W W L, then the live week
    await expect(card).toContainText('3-2');
    await expect(card).toContainText(avg(SLEEPER_PAST.map(([mine]) => mine))); // 118.6
  });

  test('rebuilds finished ESPN weeks, finding my side whether I was home or away', async ({ page }) => {
    await openHistory(page);
    const card = leagueCard(page, ESPN_LEAGUE_NAME);

    expect(await chipTitles(card)).toEqual(expectedTitles(ESPN_PAST)); // L W L W W, then the live week
    await expect(card).toContainText('3-2');
    await expect(card).toContainText(avg(ESPN_PAST.map(([mine]) => mine))); // 123.5
  });

  test('an FFPC league has only the week that was pasted, and it is an all-play week', async ({ page }) => {
    await openHistory(page);
    const card = leagueCard(page, FFPC_TEAM);

    expect(await chipTitles(card)).toEqual(['Week 6: in progress']);
    await expect(card).toContainText('Record'); // no finished weeks yet, so the record is blank
    await expect(card.getByText('Week in progress')).toBeVisible(); // legend entry for the lighter column
    await expect(card.getByText('Opponent', { exact: true })).toHaveCount(0); // all-play weeks have no single opponent
  });

  test('draws the chart with an accessible description and a hover tooltip', async ({ page }) => {
    await openHistory(page);
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);

    await expect(card.getByRole('img', { name: /your points each week/ })).toBeVisible();
    await card.locator('.recharts-bar-rectangle').nth(1).hover(); // week 2, a loss
    const tooltip = card.locator('.recharts-tooltip-wrapper'); // each chart has its own tooltip element
    await expect(tooltip).toContainText('Week 2 · Loss');
    await expect(tooltip).toContainText(pts(SLEEPER_PAST[1]![0]));
    await expect(tooltip).toContainText('Blitz Brigade');
    await expect(tooltip).toContainText(pts(SLEEPER_PAST[1]![1]));
  });

  test('the table view has every value without hovering', async ({ page }) => {
    await openHistory(page);
    await page.getByRole('button', { name: 'table', exact: true }).click();
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);

    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(7); // header + 6 weeks
    const week2 = rows.nth(2);
    await expect(week2).toContainText('Loss');
    await expect(week2).toContainText(pts(SLEEPER_PAST[1]![0]));
    await expect(week2).toContainText('Blitz Brigade');
    await expect(week2).toContainText(pts(SLEEPER_PAST[1]![1]));

    // The FFPC all-play week shows a rank instead of an opponent.
    await expect(leagueCard(page, FFPC_TEAM).getByRole('row').nth(1)).toContainText('All-play: 3rd of 6 (top 3 win)');
  });

  test('can switch back from the table to the chart', async ({ page }) => {
    await openHistory(page);
    await page.getByRole('button', { name: 'table', exact: true }).click();
    await expect(page.getByRole('table').first()).toBeVisible();
    await page.getByRole('button', { name: 'chart', exact: true }).click();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME).getByRole('img', { name: /your points/ })).toBeVisible();
  });

  test('deleting an FFPC league removes it from history', async ({ page, request }) => {
    const { id } = await findSeededLeague(request);
    await openHistory(page);
    await expect(leagueCard(page, FFPC_TEAM)).toHaveCount(1);

    expect((await request.delete(`/api/manual-leagues/${id}`)).status()).toBe(204);
    await page.reload();
    await openTab(page, 'History');
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME)).toBeVisible();
    await expect(leagueCard(page, FFPC_TEAM)).toHaveCount(0);
  });
});

// The beforeEach already seeded one league; look it up rather than creating a duplicate.
async function findSeededLeague(request: import('@playwright/test').APIRequestContext) {
  const leagues = (await (await request.get('/api/manual-leagues')).json()) as { id: string; name: string }[];
  const found = leagues.find((l) => l.name === FFPC_LEAGUE); // stored under the tournament name
  if (!found) throw new Error('expected the seeded FFPC league to exist');
  return found;
}
