import { expect, test } from './fixtures.js';
import {
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
import { leagueCard, openDashboard, pts } from './helpers.js';

test.describe('Leagues dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('shows the Sleeper league with live score, projection and rank', async ({ page }) => {
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);
    await expect(card).toContainText(`${SLEEPER_MY_TEAM} · @E2E Manager`);
    await expect(card).toContainText('Sleeper');
    await expect(card).toContainText('2nd of 4');

    await expect(card).toContainText(pts(SLEEPER_ME_POINTS));
    await expect(card).toContainText(SLEEPER_OPP_TEAM);
    await expect(card).toContainText(pts(SLEEPER_OPP_POINTS));
    await expect(card).toContainText(`Projected to win by ${pts(SLEEPER_ME_POINTS - SLEEPER_OPP_POINTS)}`);
  });

  test('shows the ESPN league using ESPN’s own team projections', async ({ page }) => {
    const card = leagueCard(page, ESPN_LEAGUE_NAME);
    await expect(card).toContainText(`${ESPN_MY_TEAM} · @e2e_espn`);
    await expect(card).toContainText('ESPN');
    await expect(card).toContainText(pts(ESPN_ME_POINTS));
    await expect(card).toContainText(ESPN_OPP_TEAM);
    await expect(card).toContainText(pts(ESPN_OPP_POINTS));
    await expect(card).toContainText(`proj ${pts(ESPN_ME_PROJECTED)}`);
    await expect(card).toContainText(`proj ${pts(ESPN_OPP_PROJECTED)}`);
    await expect(card).toContainText(`Projected to win by ${pts(ESPN_ME_PROJECTED - ESPN_OPP_PROJECTED)}`);
  });

  test('summarizes every league in the tiles at the top', async ({ page }) => {
    const tile = (label: string) => page.locator('section div').filter({ hasText: new RegExp(`^${label}`) }).first();
    await expect(tile('Combined record')).toContainText('6-4'); // 3-2 in Sleeper + 3-2 in ESPN
    await expect(tile('Winning right now')).toContainText('2 of 2');
    await expect(tile('Projected to win')).toContainText('2 of 2');
    await expect(tile('Lineup alerts')).toContainText('1');
  });

  test('warns about an injured starter', async ({ page }) => {
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME).getByRole('listitem')).toContainText('Jaylen Waddle is Questionable');
  });

  test('opens lineups side by side, with a projection under each score', async ({ page }) => {
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);
    await card.getByRole('button', { name: 'Lineups' }).click();
    await expect(card).toContainText('Josh Allen');
    await expect(card).toContainText('Patrick Mahomes'); // the opponent's quarterback
    await expect(card).toContainText('Points, with live projection underneath.');
    await expect(card.getByText('Questionable').first()).toBeVisible();
  });

  test('opens standings with my team highlighted', async ({ page }) => {
    const card = leagueCard(page, SLEEPER_LEAGUE_NAME);
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
