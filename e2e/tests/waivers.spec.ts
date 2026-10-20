import type { Page } from '@playwright/test';
import { ESPN_LEAGUE_NAME } from '../fixtures/espn.js';
import { SLEEPER_LEAGUE_NAME } from '../fixtures/sleeper.js';
import { FFPC_LEAGUE, FFPC_TEAM } from '../fixtures/ffpc.js';
import { CLAIM_WEEK, ESPN_FAAB, FFPC_FAAB_LEFT, ffpcWaiverPage, SLEEPER_FAAB } from '../fixtures/waivers.js';
import { expect, test } from './fixtures.js';
import { openDashboard, openTab, paste } from './helpers.js';
import { seedFfpcLeague } from './seed.js';

// The scenarios behind these numbers are spelled out in fixtures/waivers.ts.
const leagueSection = (page: Page, name: string) => page.getByRole('region', { name: `Waivers for ${name}` });
const moves = (page: Page, name: string) => leagueSection(page, name).getByRole('region', { name: 'Suggested moves' }).getByRole('listitem');
const pickLeague = (page: Page, name: string) => page.getByRole('group', { name: 'League' }).getByRole('button', { name }).click();

test.describe('Waivers', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
    await openTab(page, 'Waivers');
  });

  test('says which week a claim plays in', async ({ page }) => {
    await expect(page.getByText(`Claims made now play in week ${CLAIM_WEEK}`)).toBeVisible();
  });

  test('Sleeper: FAAB and priority, and a bye covered by a free agent, with a safe drop', async ({ page }) => {
    const section = leagueSection(page, SLEEPER_LEAGUE_NAME);
    await expect(section).toContainText(`$${SLEEPER_FAAB.budget - SLEEPER_FAAB.used} of $${SLEEPER_FAAB.budget} FAAB`);
    await expect(section).toContainText(`Priority ${SLEEPER_FAAB.position} of 4`);

    await expect(moves(page, SLEEPER_LEAGUE_NAME)).toHaveCount(1);
    const move = moves(page, SLEEPER_LEAGUE_NAME).first();
    await expect(move).toContainText('On bye · FLEX');
    await expect(move).toContainText(`+10.0pts in week ${CLAIM_WEEK}`); // Rice 18 over Najee Harris's 8 from the bench
    await expect(move).toContainText('Add Rashee Rice WR · KC');
    await expect(move).toContainText('for Jaylen Waddle (on bye)');
    await expect(move).toContainText('Drop Drake Maye QB36.0 rest of season, replaceable');
  });

  test('ESPN: open roster spots mean upgrades need no drop', async ({ page }) => {
    await pickLeague(page, ESPN_LEAGUE_NAME);
    const section = leagueSection(page, ESPN_LEAGUE_NAME);
    await expect(section).toContainText(`$${ESPN_FAAB.budget - ESPN_FAAB.spent} of $${ESPN_FAAB.budget} FAAB`);
    await expect(section).toContainText(`Priority ${ESPN_FAAB.waiverRank} of 4 · 2 open roster spots`);

    const list = moves(page, ESPN_LEAGUE_NAME);
    await expect(list).toHaveCount(2);
    await expect(list.nth(0)).toContainText('Upgrade · WR');
    await expect(list.nth(0)).toContainText('Add Rashee Rice WR · KC · on waivers');
    await expect(list.nth(0)).toContainText('over Malik Nabers (10.0 projected)');
    await expect(list.nth(0)).toContainText('+8.0pts');
    await expect(list.nth(1)).toContainText('Upgrade · FLEX');
    await expect(list.nth(1)).toContainText('Add Chris Olave WR · NO · free agent');
    await expect(list.nth(1)).toContainText('+4.0pts');
    for (const i of [0, 1]) await expect(list.nth(i)).toContainText('No drop: open roster spot');
  });

  test('FAAB pacing: budget per week left, and what winning bids have cost', async ({ page }) => {
    const pacing = leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('region', { name: 'FAAB pacing' });
    // $85 left, weeks 7-18.
    await expect(pacing).toContainText('$85 left for 12 weeks: about $7 a week.');
    await expect(pacing).toContainText('Spent 15% of your budget with 33% of the regular season gone: room to bid bigger.');
    await expect(pacing).toContainText('median $5, most $18 (5 claims)');
    await expect(pacing).toContainText('Biggest: Puka Nacua WR $18 (wk 2), Chris Olave WR $9 (wk 5), Jonathon Brooks RB $5 (wk 3)');
  });

  test('lists the bye weeks ahead and whether the rest of the roster covers them', async ({ page }) => {
    // DEN is on bye in the claim week; Najee Harris can take Waddle's FLEX spot.
    const byes = leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('region', { name: 'Bye weeks' });
    await expect(byes.getByRole('listitem')).toHaveCount(1);
    await expect(byes.getByRole('listitem')).toHaveText(`Week ${CLAIM_WEEK}Jaylen Waddle WRLineup covered`);
  });

  test('the Refresh button reloads the Waivers tab too', async ({ page }) => {
    await expect(leagueSection(page, SLEEPER_LEAGUE_NAME)).toBeVisible();
    const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/waivers') && r.ok());
    await page.getByRole('button', { name: 'Refresh' }).click();
    await reloaded;
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  test('ESPN: shows the claims you have in, with the bid and the drop', async ({ page }) => {
    await pickLeague(page, ESPN_LEAGUE_NAME);
    const claims = leagueSection(page, ESPN_LEAGUE_NAME).getByRole('region', { name: 'Your claims' }).getByRole('listitem');
    await expect(claims).toHaveCount(2);
    await expect(leagueSection(page, ESPN_LEAGUE_NAME)).toContainText('Your claims2 pending on ESPN');
    // Oldest first: Rice, then Geno Smith, who isn't in the free-agent list and is looked up by id.
    await expect(claims.nth(0)).toContainText('Add Rashee Rice WR · KC');
    await expect(claims.nth(0)).toContainText('No drop');
    await expect(claims.nth(0)).toContainText('$22');
    await expect(claims.nth(1)).toContainText('Add Geno Smith QB · NYJ');
    await expect(claims.nth(1)).toContainText('Drop Najee Harris RB · NYG');
    await expect(claims.nth(1)).toContainText('$5');
  });

  test('puts leagues in order of their next waiver run, learned from processed claims', async ({ page }) => {
    const pills = page.getByRole('group', { name: 'League' }).getByRole('button');
    await expect(pills.nth(0)).toContainText(`${SLEEPER_LEAGUE_NAME}Sleeper · Tue night, in`); // Wed 3 AM: overnight, so the night before
    await expect(pills.nth(1)).toContainText(`${ESPN_LEAGUE_NAME}ESPN · schedule unknown`); // no claim history: unknown, so last
    const runs = leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('definition').first();
    await expect(runs).toContainText(/^Tue night \(Wed 3:00 AM\) ETnext in /);
    await expect(runs.locator('[title]')).toHaveAttribute('title', "Learned from this league's processed claims");
    await pickLeague(page, ESPN_LEAGUE_NAME);
    await expect(leagueSection(page, ESPN_LEAGUE_NAME).getByRole('definition').first()).toHaveText('Not known yet');
  });

  test('marking claims set for the next run sticks, and can be undone', async ({ page }) => {
    const section = leagueSection(page, SLEEPER_LEAGUE_NAME);
    await section.getByRole('button', { name: 'Claims set' }).click();
    await expect(section).toContainText('Set for this run');

    await page.reload();
    await openTab(page, 'Waivers');
    await expect(leagueSection(page, SLEEPER_LEAGUE_NAME)).toContainText('Set for this run');
    await leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('button', { name: 'Undo' }).click();
    await expect(leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('button', { name: 'Claims set' })).toBeVisible();
  });

  test('a league whose reminder time has come is flagged in red until its claims are set', async ({ page }) => {
    // Pretend it's after 9 PM the night before the Sleeper run: the real response,
    // with Sleeper's reminder due whenever its claims aren't set.
    await page.route('**/api/waivers', async (route) => {
      const body = await (await route.fetch()).json();
      for (const l of body.leagues) if (l.platform === 'sleeper' && l.claims) l.claims.reminderDue = !l.claims.set;
      await route.fulfill({ json: body });
    });
    await page.reload();

    const nav = page.getByRole('navigation', { name: 'Sections' });
    // Waivers load in the background on every tab; allow for that after the reload.
    await expect(nav.getByRole('button', { name: 'Waivers (1 league needs your claims)' })).toBeVisible({ timeout: 15_000 });
    await openTab(page, 'Waivers');
    const pill = page.getByRole('group', { name: 'League' }).getByRole('button', { name: new RegExp(`^${SLEEPER_LEAGUE_NAME}`) });
    await expect(pill).toHaveAccessibleName(/claims not set/);
    const section = leagueSection(page, SLEEPER_LEAGUE_NAME);
    await expect(section.getByRole('status')).toContainText("Your claims for this run aren't set yet.");

    await section.getByRole('button', { name: 'Claims set' }).click();
    await expect(section.getByRole('status')).toHaveCount(0);
    await expect(pill).not.toHaveAccessibleName(/claims not set/);
    await expect(nav.getByRole('button', { name: 'Waivers', exact: true })).toBeVisible(); // badge gone
  });

  test('a reminder’s link opens the Waivers tab on its league', async ({ page }) => {
    await page.goto(`/?view=waivers&league=${encodeURIComponent('espn:900001')}`);
    await expect(leagueSection(page, ESPN_LEAGUE_NAME)).toBeVisible();
  });

  test('best available can be ranked by this week, rest of season or trending adds', async ({ page }) => {
    const section = leagueSection(page, SLEEPER_LEAGUE_NAME);
    await section.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'WR', exact: true }).click();
    const rows = section.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toContainText('Rashee Rice');
    await expect(rows.nth(1)).toContainText('18.0');
    await expect(rows.nth(1)).toContainText('216.0'); // 18 a week, weeks 7 through 18

    await section.getByLabel('Rank by').selectOption('trending');
    await expect(rows.nth(1)).toContainText('Rashee Rice');
    await expect(rows.nth(1)).toContainText('41k');
    await expect(rows.nth(2)).toContainText('Chris Olave');
    await expect(rows).toHaveCount(3); // header + the two trending players
  });

  test('"All" groups the best available by position instead of mixing them', async ({ page }) => {
    const table = leagueSection(page, SLEEPER_LEAGUE_NAME).getByRole('table');
    await expect(table.getByRole('rowheader', { name: 'QB' })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: 'WR' })).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Geno Smith' })).toHaveCount(1);
  });
});

test.describe('FFPC waivers (pasted add/drop page)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedFfpcLeague(request);
    await openDashboard(page);
    await openTab(page, 'Waivers');
    await pickLeague(page, FFPC_TEAM);
  });

  const pasteBox = (page: Page) => leagueSection(page, FFPC_TEAM).getByPlaceholder("Paste FFPC's add/drop page here");

  test('asks for the page until it has been pasted', async ({ page }) => {
    await expect(leagueSection(page, FFPC_TEAM)).toContainText("FFPC has no API, so paste the league's add/drop page");
    await expect(pasteBox(page)).toBeVisible();
    await expect(leagueSection(page, FFPC_TEAM).getByRole('heading', { name: 'Suggested moves' })).toHaveCount(0);
  });

  test('one paste gives FAAB, the bid schedule, a move and the best available', async ({ page }) => {
    await paste(pasteBox(page), ffpcWaiverPage());
    const section = leagueSection(page, FFPC_TEAM);
    await expect(section).toContainText(`$${FFPC_FAAB_LEFT} FAAB`);
    await expect(section).toContainText('Wed 11:00 PM and Sun 10:00 AM ETnext in'); // FFPC_BID_SCHEDULE, read from the page
    await expect(section).toContainText("From FFPC's add/drop page as pasted");

    const list = moves(page, FFPC_TEAM);
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText('Upgrade · WR');
    await expect(list.first()).toContainText('Add Jayden Reed WR · GB');
    // The page projects Mike Evans for 6, but the paste is a snapshot: Sleeper's
    // live projections (scored with FFPC's rules) win, and they have Evans at 10,
    // so Reed's 16 replaces the 10-point Malik Nabers instead.
    await expect(list.first()).toContainText('over Malik Nabers (10.0 projected)');
    await expect(list.first()).not.toContainText('Mike Evans');
    await expect(list.first()).toContainText('+6.0pts');
    await expect(list.first()).toContainText('Drop Drake Maye QB36.0 rest of season');

    // Rest of season comes from Sleeper's projections scored with FFPC's rules: 16 a week for 12 weeks.
    await section.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'WR', exact: true }).click();
    await expect(section.getByRole('table').getByRole('row').nth(1)).toContainText('192.0');

    // Stored: still there after a reload.
    await page.reload();
    await openTab(page, 'Waivers');
    await pickLeague(page, FFPC_TEAM);
    await expect(moves(page, FFPC_TEAM)).toHaveCount(1);
  });

  test('refuses a page from a different league, or a page that isn’t the add/drop page', async ({ page }) => {
    await paste(pasteBox(page), ffpcWaiverPage('#99999'));
    await expect(leagueSection(page, FFPC_TEAM).getByRole('alert')).toContainText(`That page is for league #99999, not ${FFPC_LEAGUE}.`);
    await paste(pasteBox(page), 'QB Josh Allen');
    await expect(leagueSection(page, FFPC_TEAM).getByRole('alert')).toContainText("doesn't look like FFPC's add/drop page");
  });
});
