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
} from '@ffd/demo/fixtures/espn';
import {
  SLEEPER_LEAGUE_NAME,
  SLEEPER_ME_POINTS,
  SLEEPER_MY_TEAM,
  SLEEPER_OPP_POINTS,
  SLEEPER_OPP_TEAM,
} from '@ffd/demo/fixtures/sleeper';
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

  test('before the week’s first game, sums it up by projection instead', async ({ page }) => {
    // The same week with nothing scored yet, as on a Tuesday.
    await page.route('**/api/dashboard', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      for (const l of body.leagues) {
        if (!l.matchup) continue;
        for (const side of [l.matchup.me, l.matchup.opponent]) if (side) side.points = 0;
      }
      await route.fulfill({ response: res, json: body });
    });
    await page.reload();
    const hero = page.getByRole('region', { name: 'This week' });
    await expect(hero).toContainText('Projected to win 2 of 2');
    await expect(hero).toContainText('no games played yet this week');
    await expect(hero).not.toContainText('winning');
    // The table shows projected scores, not 0.00 vs 0.00.
    const espn = leagueCard(page, ESPN_LEAGUE_NAME);
    await expect(espn).toContainText(`${pts(ESPN_ME_PROJECTED)}proj.${pts(ESPN_OPP_PROJECTED)}`);
    await expect(espn).toContainText(`+${(ESPN_ME_PROJECTED - ESPN_OPP_PROJECTED).toFixed(1)}`);
  });

  test('lists every league with scores, margin and chance to win, the most uncertain first', async ({ page }) => {
    const rows = page.getByRole('region', { name: 'Matchups' }).getByRole('article');
    await expect(rows).toHaveCount(2);
    // Sleeper's games are all final (decided: 100%); ESPN still has projected
    // points to come, so its 15.5-point projected lead is 99%, the less certain.
    await expect(rows.nth(0)).toHaveAccessibleName(ESPN_LEAGUE_NAME);
    await expect(rows.nth(0)).toContainText('99%');
    await expect(rows.nth(1)).toContainText('100%');
    await expect(rows.nth(0)).toContainText(`+${(ESPN_ME_POINTS - ESPN_OPP_POINTS).toFixed(1)}`);
    await expect(rows.nth(1)).toHaveAccessibleName(SLEEPER_LEAGUE_NAME);
    await expect(rows.nth(1)).toContainText(pts(SLEEPER_ME_POINTS));
    await expect(rows.nth(1)).toContainText(pts(SLEEPER_OPP_POINTS));
    await expect(rows.nth(1)).toContainText(`+${(SLEEPER_ME_POINTS - SLEEPER_OPP_POINTS).toFixed(1)}`);
  });

  test('shows PMR for both sides of each matchup', async ({ page }) => {
    // The default test window is 1280 wide, where the PMR columns appear.
    const rows = page.getByRole('region', { name: 'Matchups' }).getByRole('article');
    const espn = rows.filter({ has: page.getByText(ESPN_LEAGUE_NAME, { exact: true }) });
    const sleeper = rows.filter({ has: page.getByText(SLEEPER_LEAGUE_NAME, { exact: true }) });
    // Player minutes remaining: Jayden Reed's GB game hasn't started (60); every other game is final.
    await expect(espn).toContainText('60 player minutes remaining for you0 for your opponent');
    await expect(sleeper).toContainText('0 player minutes remaining for you0 for your opponent');
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

  test('opening a league shows lineups side by side, with a projection under each score', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await expect(card.getByRole('button', { name: 'Lineups' })).toHaveAttribute('aria-pressed', 'true'); // open from the start
    await expect(card).toContainText('Josh Allen');
    await expect(card).toContainText('Patrick Mahomes'); // the opponent's quarterback
    await expect(card).toContainText('Points, with live projection underneath.');
    await expect(card.getByText('Questionable').first()).toBeVisible();

    // The Lineups button now closes them.
    await card.getByRole('button', { name: 'Lineups' }).click();
    await expect(card).not.toContainText('Points, with live projection underneath.');
  });

  test('opens standings with my team highlighted', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_LEAGUE_NAME);
    await card.getByRole('button', { name: 'Standings' }).click();
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(5); // header + 4 teams
    await expect(rows.nth(1)).toContainText('Third Wheel'); // 4-1 leads
    await expect(rows.nth(2)).toContainText(SLEEPER_MY_TEAM); // 3-2 is second
  });

  test('reports a failing league without hiding the others, with the fix for refused ESPN cookies', async ({ page }) => {
    // League 900002 always answers 401 to our cookies: one banner says how to fix it,
    // and the working leagues still render.
    const banner = page.getByRole('alert').filter({ hasText: 'ESPN stopped accepting your cookies' });
    await expect(banner).toContainText("an ESPN league can't load");
    await expect(banner).toContainText('update ESPN_S2 and ESPN_SWID');
    // The status line under the matchups: ESPN partly loaded (one league refused the cookies).
    const status = page.getByLabel('Data sources');
    await expect(status).toContainText('Sleeper loaded');
    await expect(status).toContainText('ESPN cookies refused');
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME)).toBeVisible();
    await expect(leagueCard(page, ESPN_LEAGUE_NAME)).toBeVisible();
  });

  test('has no Yahoo prompt when Yahoo is not configured', async ({ page }) => {
    await expect(page.getByText('Connect your Yahoo account')).toHaveCount(0);
  });
});

test.describe('Lineup status', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  const lineup = (page: import('@playwright/test').Page, name: string) => leagueCard(page, name).getAttribute('data-lineup');

  test('a questionable starter with a healthy bench swap turns the row yellow, with the fix inside', async ({ page }) => {
    expect(await lineup(page, ESPN_LEAGUE_NAME)).toBe('yellow');
    await expect(leagueCard(page, ESPN_LEAGUE_NAME)).toContainText('Jayden Reed questionable');
    const issues = (await openLeague(page, ESPN_LEAGUE_NAME)).getByRole('region', { name: 'Lineup issues' });
    // Mike Evans is healthy on the bench too, but his game is over; Higgins's as well.
    await expect(issues).toContainText('Start Romeo Doubs (WR) from your bench instead');
    await expect(issues.getByRole('link', { name: /Fix it on ESPN/ })).toHaveAttribute('href', new RegExp(`leagueId=${ESPN_LEAGUE_ID}&teamId=1`));
  });

  test('a lineup with nothing to fix is green; a game that has started no longer counts', async ({ page }) => {
    // Jaylen Waddle is questionable in Sleeper, but DEN's game is final: the lineup is locked.
    expect(await lineup(page, SLEEPER_LEAGUE_NAME)).toBe('green');
    await expect(leagueCard(page, SLEEPER_LEAGUE_NAME)).not.toContainText('Jaylen Waddle');
  });

  test('an Out starter, or a slot nobody can fill, turns it red; a slot a free agent can fill stays yellow', async ({ page }) => {
    const withAlerts = async (alerts: object[]) => {
      await page.route('**/api/dashboard', async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        body.leagues.find((l: { name: string }) => l.name === ESPN_LEAGUE_NAME).alerts = alerts;
        await route.fulfill({ response: res, json: body });
      });
      await page.reload();
    };
    // An empty RB slot with nobody on the bench: free agent Breece Hall can fill it.
    await withAlerts([{ slot: 'RB', playerId: null, playerName: null, reason: 'empty', detail: 'Empty RB slot', suggestion: null }]);
    expect(await lineup(page, ESPN_LEAGUE_NAME)).toBe('yellow');
    await expect((await openLeague(page, ESPN_LEAGUE_NAME)).getByRole('region', { name: 'Lineup issues' })).toContainText('Pick up Breece Hall (RB)');

    // No kicker anywhere, and a starter who is out.
    await page.unrouteAll();
    await withAlerts([
      { slot: 'K', playerId: null, playerName: null, reason: 'empty', detail: 'Empty K slot', suggestion: null },
      { slot: 'WR', playerId: 'x', playerName: 'Jayden Reed', reason: 'injury', detail: 'Out', suggestion: null },
    ]);
    expect(await lineup(page, ESPN_LEAGUE_NAME)).toBe('red');
    await expect(leagueCard(page, ESPN_LEAGUE_NAME)).toContainText('Empty K · Jayden Reed out');

    // Out, but with a healthy bench player to start instead: fixable, so yellow.
    await page.unrouteAll();
    await withAlerts([{ slot: 'WR', playerId: 'x', playerName: 'Jayden Reed', reason: 'injury', detail: 'Out', suggestion: { playerName: 'Romeo Doubs', position: 'WR', projected: 9 } }]);
    expect(await lineup(page, ESPN_LEAGUE_NAME)).toBe('yellow');
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
