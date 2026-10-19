import { expect, test } from './fixtures.js';
import {
  ESPN_LEAGUE_ID,
  ESPN_LEAGUE_NAME,
  ESPN_ME_POINTS,
  ESPN_ME_PROJECTED,
  ESPN_MY_TEAM,
  ESPN_OPP_POINTS,
  ESPN_OPP_PROJECTED,
  ESPN_OPP_TEAM,
} from '../fixtures/espn.js';
import {
  SLEEPER_LEAGUE_NAME,
  SLEEPER_ME_POINTS,
  SLEEPER_MY_TEAM,
  SLEEPER_OPP_POINTS,
  SLEEPER_OPP_TEAM,
} from '../fixtures/sleeper.js';
import { leagueCard, openDashboard, openLeague, pts } from './helpers.js';

test.describe('Matchups', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('sums up the week at the top', async ({ page }) => {
    const hero = page.getByRole('region', { name: 'This week' });
    await expect(hero).toContainText('2 of 2 winning');
    await expect(hero).toContainText('Season 6-4'); // 3-2 in Sleeper + 3-2 in ESPN
    await expect(hero).toContainText('projected 2 of 2');
  });

  test('lists every league with my score, the opponent’s and the margin, biggest lead first', async ({ page }) => {
    const rows = page.getByRole('region', { name: 'Matchups' }).getByRole('article');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAccessibleName(SLEEPER_LEAGUE_NAME);
    await expect(rows.nth(0)).toContainText(pts(SLEEPER_ME_POINTS));
    await expect(rows.nth(0)).toContainText(pts(SLEEPER_OPP_POINTS));
    await expect(rows.nth(0)).toContainText(`+${(SLEEPER_ME_POINTS - SLEEPER_OPP_POINTS).toFixed(1)}`);
    await expect(rows.nth(1)).toHaveAccessibleName(ESPN_LEAGUE_NAME);
    await expect(rows.nth(1)).toContainText(`+${(ESPN_ME_POINTS - ESPN_OPP_POINTS).toFixed(1)}`);
  });

  test('opening the Sleeper league shows team, rank and projections', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await expect(card).toContainText(`${SLEEPER_MY_TEAM} · @E2E Manager`);
    await expect(card).toContainText('2nd of 4');
    await expect(card).toContainText(SLEEPER_OPP_TEAM);
    await expect(card).toContainText(`Projected to win by ${pts(SLEEPER_ME_POINTS - SLEEPER_OPP_POINTS)}`);
  });

  test('opening the ESPN league uses ESPN’s own team projections', async ({ page }) => {
    const card = await openLeague(page, ESPN_LEAGUE_NAME);
    await expect(card).toContainText(`${ESPN_MY_TEAM} · @e2e_espn`);
    await expect(card).toContainText(ESPN_OPP_TEAM);
    await expect(card).toContainText(`proj ${pts(ESPN_ME_PROJECTED)}`);
    await expect(card).toContainText(`proj ${pts(ESPN_OPP_PROJECTED)}`);
    await expect(card).toContainText(`Projected to win by ${pts(ESPN_ME_PROJECTED - ESPN_OPP_PROJECTED)}`);
  });

  test('a row closes again, hiding its details', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await expect(card.getByRole('button', { name: 'Standings' })).toBeVisible();
    await card.locator('button[aria-expanded]').click();
    await expect(card.getByRole('button', { name: 'Standings' })).toHaveCount(0);
  });

  test('opens lineups side by side, with a projection under each score', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await card.getByRole('button', { name: 'Lineups' }).click();
    await expect(card).toContainText('Josh Allen');
    await expect(card).toContainText('Patrick Mahomes'); // the opponent's quarterback
    await expect(card).toContainText('Points, with live projection underneath.');
    await expect(card.getByText('Questionable').first()).toBeVisible();
  });

  test('opens standings with my team highlighted', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await card.getByRole('button', { name: 'Standings' }).click();
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(5); // header + 4 teams
    await expect(rows.nth(1)).toContainText('Third Wheel'); // 4-1 leads
    await expect(rows.nth(2)).toContainText(SLEEPER_MY_TEAM); // 3-2 is second
  });

  test('reports a failing league without hiding the others', async ({ page }) => {
    // League 900002 always answers 401; the error is shown, the working leagues still render.
    await expect(page.getByText('espn:900002')).toBeVisible();
    await expect(page.getByText('rejected the cookies for league 900002')).toBeVisible();
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME)).toBeVisible();
    await expect(leagueCard(page, ESPN_LEAGUE_NAME)).toBeVisible();
  });

  test('has no Yahoo prompt when Yahoo is not configured', async ({ page }) => {
    await expect(page.getByText('Connect your Yahoo account')).toHaveCount(0);
  });
});

test.describe('Lineup alerts', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  const alerts = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Lineup alerts' }).getByRole('listitem');

  test('warns about a questionable starter whose game hasn’t started, with a healthy bench swap', async ({ page }) => {
    const alert = alerts(page).filter({ hasText: 'Jayden Reed' });
    await expect(alert).toContainText(`Jayden Reed (Questionable) starts at WR in ${ESPN_LEAGUE_NAME}`);
    // Mike Evans is healthy on the bench too, but his game is over; Higgins's as well.
    await expect(alert).toContainText("Romeo Doubs (WR) is healthy on your bench and hasn't played yet");
    await expect(alert).toContainText('projected 31.5 in PPR'); // the fixture projection, scored as plain PPR
    await expect(alert.getByRole('link', { name: /Open ESPN/ })).toHaveAttribute('href', new RegExp(`leagueId=${ESPN_LEAGUE_ID}&teamId=1`));
  });

  test('drops the alert once that player’s game has started: the lineup is locked', async ({ page }) => {
    // Jaylen Waddle is questionable in Sleeper, but DEN's game is final.
    await expect(alerts(page)).toHaveCount(1);
    await expect(alerts(page).filter({ hasText: 'Jaylen Waddle' })).toHaveCount(0);
  });
});

test.describe('On a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the sections are a tab bar at the bottom of the screen', async ({ page }) => {
    await openDashboard(page);
    const nav = page.getByRole('navigation', { name: 'Sections' });
    const box = await nav.boundingBox();
    expect(box && box.y + box.height).toBeCloseTo(812, 0);
    await nav.getByRole('button', { name: 'Players' }).click();
    await expect(nav.getByRole('button', { name: 'Players' })).toHaveAttribute('aria-current', 'page');
  });

  test('every league row still fits, with its score', async ({ page }) => {
    await openDashboard(page);
    const row = leagueCard(page, SLEEPER_LEAGUE_NAME);
    await expect(row).toContainText(pts(SLEEPER_ME_POINTS));
    const box = await row.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});
