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
import { leagueCard, openDashboard, openLeague, openTab, pts } from './helpers.js';

test.describe('Matchups', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('sums up the week at the top', async ({ page }) => {
    const week = page.getByRole('region', { name: 'This week' });
    await expect(week).toContainText('2.0 wins expected'); // 99% + 100%
    await expect(week).toContainText('2 leading right now');
    await expect(week).toContainText('Season 6-4'); // 3-2 in Sleeper + 3-2 in ESPN
  });

  test('once every game is over, says how the week went', async ({ page }) => {
    await page.route('**/api/dashboard', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      for (const l of body.leagues) {
        for (const side of [l.matchup?.me, l.matchup?.opponent]) {
          for (const s of side?.starters ?? []) if (s.game) s.game.state = 'final';
          if (side) side.projected = side.points;
        }
      }
      await route.fulfill({ response: res, json: body });
    });
    await page.reload();
    await expect(page.getByRole('region', { name: 'This week' })).toContainText('2 of 2 won');
    await expect(leagueCard(page, ESPN_MY_TEAM)).toContainText('Won');
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
    const week = page.getByRole('region', { name: 'This week' });
    await expect(week).toContainText('wins expected');
    await expect(week).toContainText('no games played yet this week');
    await expect(week).not.toContainText('leading');
    // The card shows projected scores, not 0.00 vs 0.00.
    const espn = leagueCard(page, ESPN_MY_TEAM);
    await expect(espn).toContainText(pts(ESPN_ME_PROJECTED));
    await expect(espn).toContainText(pts(ESPN_OPP_PROJECTED));
    await expect(espn).toContainText('Projected: no one has played yet');
  });

  test('has a card for every league with scores, projections and chance to win, in a fixed order', async ({ page }) => {
    const cards = page.getByRole('region', { name: 'Your teams' }).getByRole('article');
    await expect(cards).toHaveCount(2);
    // Sleeper's games are all final (decided: 100%); ESPN still has projected
    // points to come, so its 15.5-point projected lead is 99%.
    const sleeper = leagueCard(page, SLEEPER_MY_TEAM);
    const espn = leagueCard(page, ESPN_MY_TEAM);
    await expect(cards.nth(0)).toHaveAccessibleName(SLEEPER_MY_TEAM);
    await expect(cards.nth(1)).toHaveAccessibleName(ESPN_MY_TEAM);
    await expect(sleeper).toContainText('100%');
    await expect(sleeper).toContainText('Won');
    await expect(espn).toContainText('99%');
    await expect(espn).toContainText('Cruising');
    await expect(espn).toContainText(`proj ${pts(ESPN_ME_PROJECTED)}`);
    await expect(espn).toContainText(pts(ESPN_ME_POINTS));
    await expect(espn).toContainText(pts(ESPN_OPP_POINTS));
    // Named by your team, with the league's own name beneath it.
    await expect(sleeper).toContainText(`${SLEEPER_MY_TEAM}${SLEEPER_LEAGUE_NAME} · Sleeper`);
    await expect(sleeper).toContainText(pts(SLEEPER_ME_POINTS));
    await expect(sleeper).toContainText(pts(SLEEPER_OPP_POINTS));
  });

  test('keeps a card in its spot when the odds change', async ({ page }) => {
    await page.route('**/api/dashboard', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      // Sleeper's matchup becomes the closer one, which would once have moved it.
      const m = body.leagues[0].matchup;
      m.me.projected = 100;
      m.opponent.projected = 100;
      await route.fulfill({ response: res, json: body });
    });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Your teams' }).getByRole('article').first()).toHaveAccessibleName(SLEEPER_MY_TEAM);
  });

  test('says who is left to play on each side', async ({ page }) => {
    // Jayden Reed's GB game hasn't started; every other game is final.
    const espn = leagueCard(page, ESPN_MY_TEAM);
    await expect(espn).toContainText('You');
    await expect(espn).toContainText('0 live, 1 to come');
    await expect(espn).toContainText('Them');
    await expect(espn).toContainText('all done');
    await expect(leagueCard(page, SLEEPER_MY_TEAM)).not.toContainText('to come');
  });

  test('shows the latest play that counted in a league on its card', async ({ page }) => {
    const at = new Date().toISOString();
    const player = { playerId: '1', name: 'Amon-Ra St. Brown', position: 'WR', nflTeam: 'DET', injuryStatus: null };
    await page.route('**/api/live', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.events = [{ id: 1, at, week: 6, player, description: '1 catch, 28 rec yds', leagues: [{ leagueKey: `espn:${ESPN_LEAGUE_ID}`, leagueName: ESPN_LEAGUE_NAME, platform: 'espn', role: 'opponent', points: 3.8 }] }];
      await route.fulfill({ response: res, json: body });
    });
    await page.reload();
    const espn = leagueCard(page, ESPN_MY_TEAM);
    await expect(espn).toContainText('St. Brown −3.8'); // his points hurt you: he's starting against you
    await expect(espn).toContainText('1 catch, 28 rec yds');
    await expect(leagueCard(page, SLEEPER_MY_TEAM)).not.toContainText('St. Brown');
  });

  test('draws win chance over the week once there’s some to draw', async ({ page }) => {
    const line = leagueCard(page, ESPN_MY_TEAM).locator('svg');
    await expect(line).toHaveCount(0); // nothing has been recorded: no game is on

    await page.route('**/api/live/win-chance', (route) =>
      route.fulfill({
        json: {
          week: 6,
          leagues: {
            [`espn:${ESPN_LEAGUE_ID}`]: [
              { at: '2026-11-01T18:00:00Z', chance: 0.4 },
              { at: '2026-11-01T18:01:00Z', chance: 0.6 },
            ],
          },
        },
      }),
    );
    await page.reload();
    await expect(line).toHaveCount(1);
    await expect(leagueCard(page, SLEEPER_MY_TEAM).locator('svg')).toHaveCount(0);
  });

  test('opening the details shows PMR for both sides', async ({ page }) => {
    const details = await openLeague(page, ESPN_MY_TEAM);
    await expect(details).toContainText('PMR 60 · 0');
  });

  test('opening the Sleeper league shows team, rank and projections', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_MY_TEAM);
    await expect(card).toContainText(`${SLEEPER_MY_TEAM} · @E2E Manager`);
    await expect(card).toContainText('2nd of 4');
    await expect(card).toContainText(SLEEPER_OPP_TEAM);
    await expect(card).toContainText(`Projected to win by ${pts(SLEEPER_ME_POINTS - SLEEPER_OPP_POINTS)}`);
  });

  test('opening the ESPN league uses ESPN’s own team projections', async ({ page }) => {
    const card = await openLeague(page, ESPN_MY_TEAM);
    await expect(card).toContainText(`${ESPN_MY_TEAM} · @e2e_espn`);
    await expect(card).toContainText(ESPN_OPP_TEAM);
    await expect(card).toContainText(`proj ${pts(ESPN_ME_PROJECTED)}`);
    await expect(card).toContainText(`proj ${pts(ESPN_OPP_PROJECTED)}`);
    await expect(card).toContainText(`Projected to win by ${pts(ESPN_ME_PROJECTED - ESPN_OPP_PROJECTED)}`);
  });

  test('details close with the button or Escape, and opening another league swaps them', async ({ page }) => {
    const details = await openLeague(page, SLEEPER_MY_TEAM);
    await expect(details.getByRole('button', { name: 'Standings' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(details).toHaveCount(0);
    await expect(leagueCard(page, SLEEPER_MY_TEAM).locator('button[aria-expanded]')).toBeFocused();

    await openLeague(page, SLEEPER_MY_TEAM);
    const espn = await openLeague(page, ESPN_MY_TEAM);
    await expect(details).toHaveCount(0);
    await expect(espn).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(espn).toHaveCount(0);
  });

  test('opening a league shows lineups side by side, with a projection under each score', async ({ page }) => {
    const card = await openLeague(page, SLEEPER_MY_TEAM);
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
    const card = await openLeague(page, SLEEPER_MY_TEAM);
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
    await expect(leagueCard(page, SLEEPER_MY_TEAM)).toBeVisible();
    await expect(leagueCard(page, ESPN_MY_TEAM)).toBeVisible();
  });

  test('has no Yahoo prompt when Yahoo is not configured', async ({ page }) => {
    await expect(page.getByText('Connect your Yahoo account')).toHaveCount(0);
  });
});

test.describe('Yahoo attribution', () => {
  test('shows "Fantasy data provided by Yahoo Fantasy" whenever a Yahoo league is on the page, and only then', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByText('Fantasy data provided by')).toHaveCount(0);

    // A made-up Yahoo league added to the page's data.
    await page.route('**/api/dashboard', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.leagues.push({ ...body.leagues[0], platform: 'yahoo', leagueId: '461.l.777001', myTeamId: '461.l.777001.t.4', name: 'Made-Up Yahoo League' });
      await route.fulfill({ response: res, json: body });
    });
    await page.reload();
    const credit = page.getByText('Fantasy data provided by');
    await expect(credit).toBeVisible();
    await expect(credit.getByRole('link', { name: 'Yahoo Fantasy' })).toHaveAttribute('href', /fantasysports\.yahoo\.com/);
    await openTab(page, 'Players');
    await expect(page.getByText('Fantasy data provided by')).toBeVisible(); // on every tab
  });
});

test.describe('Lineup status', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  const lineup = (page: import('@playwright/test').Page, name: string) => leagueCard(page, name).getAttribute('data-lineup');

  test('a questionable starter with a healthy bench swap flags the card yellow, with the fix inside', async ({ page }) => {
    expect(await lineup(page, ESPN_MY_TEAM)).toBe('yellow');
    await expect(leagueCard(page, ESPN_MY_TEAM)).toContainText('Jayden Reed questionable');
    const issues = (await openLeague(page, ESPN_MY_TEAM)).getByRole('region', { name: 'Lineup issues' });
    // Mike Evans is healthy on the bench too, but his game is over; Higgins's as well.
    await expect(issues).toContainText('Start Romeo Doubs (WR) from your bench instead');
    await expect(issues.getByRole('link', { name: /Fix it on ESPN/ })).toHaveAttribute('href', new RegExp(`leagueId=${ESPN_LEAGUE_ID}&teamId=1`));
  });

  test('a questionable warning can be cleared, which turns the card green, and undone', async ({ page }) => {
    const issues = (await openLeague(page, ESPN_MY_TEAM)).getByRole('region', { name: 'Lineup issues' });
    await issues.getByRole('button', { name: 'Clear the warning for Jayden Reed' }).click();
    await expect.poll(() => lineup(page, ESPN_MY_TEAM)).toBe('green');
    await expect(issues).toContainText('Jayden Reed questionable · WR · cleared for this week');
    await expect(issues).not.toContainText('Start Romeo Doubs');

    // It's saved, not just on this page.
    await page.reload();
    await expect.poll(() => lineup(page, ESPN_MY_TEAM)).toBe('green');

    const reopened = (await openLeague(page, ESPN_MY_TEAM)).getByRole('region', { name: 'Lineup issues' });
    await reopened.getByRole('button', { name: 'Undo clearing the warning for Jayden Reed' }).click();
    await expect.poll(() => lineup(page, ESPN_MY_TEAM)).toBe('yellow');
    await expect(reopened).toContainText('Start Romeo Doubs (WR) from your bench instead');
  });

  test('a lineup with nothing to fix is green; a game that has started no longer counts', async ({ page }) => {
    // Jaylen Waddle is questionable in Sleeper, but DEN's game is final: the lineup is locked.
    expect(await lineup(page, SLEEPER_MY_TEAM)).toBe('green');
    await expect(leagueCard(page, SLEEPER_MY_TEAM)).not.toContainText('Jaylen Waddle');
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
    expect(await lineup(page, ESPN_MY_TEAM)).toBe('yellow');
    await expect((await openLeague(page, ESPN_MY_TEAM)).getByRole('region', { name: 'Lineup issues' })).toContainText('Pick up Breece Hall (RB)');

    // No kicker anywhere, and a starter who is out.
    await page.unrouteAll();
    await withAlerts([
      { slot: 'K', playerId: null, playerName: null, reason: 'empty', detail: 'Empty K slot', suggestion: null },
      { slot: 'WR', playerId: 'x', playerName: 'Jayden Reed', reason: 'injury', detail: 'Out', suggestion: null },
    ]);
    expect(await lineup(page, ESPN_MY_TEAM)).toBe('red');
    await expect(leagueCard(page, ESPN_MY_TEAM)).toContainText('Empty K · Jayden Reed out');

    // Out, but with a healthy bench player to start instead: fixable, so yellow.
    await page.unrouteAll();
    await withAlerts([{ slot: 'WR', playerId: 'x', playerName: 'Jayden Reed', reason: 'injury', detail: 'Out', suggestion: { playerName: 'Romeo Doubs', position: 'WR', projected: 9 } }]);
    expect(await lineup(page, ESPN_MY_TEAM)).toBe('yellow');
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

  test('every league card still fits, with its score', async ({ page }) => {
    await openDashboard(page);
    const card = leagueCard(page, SLEEPER_MY_TEAM);
    await expect(card).toContainText(pts(SLEEPER_ME_POINTS));
    const box = await card.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('a league’s details cover the screen, and close back to the wall', async ({ page }) => {
    await openDashboard(page);
    const details = await openLeague(page, SLEEPER_MY_TEAM);
    const box = await details.boundingBox();
    expect(box!.x).toBeLessThan(5);
    expect(box!.width).toBeGreaterThan(360);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(leagueCard(page, ESPN_MY_TEAM)).toBeVisible();
  });
});
