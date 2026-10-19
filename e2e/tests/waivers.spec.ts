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
const moves = (page: Page, name: string) => leagueSection(page, name).getByRole('listitem');
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
    await expect(section).toContainText(`$${SLEEPER_FAAB.budget - SLEEPER_FAAB.used} of $${SLEEPER_FAAB.budget} FAAB left · priority ${SLEEPER_FAAB.position} of 4`);

    await expect(moves(page, SLEEPER_LEAGUE_NAME)).toHaveCount(1);
    const move = moves(page, SLEEPER_LEAGUE_NAME).first();
    await expect(move).toContainText('On bye · FLEX');
    await expect(move).toContainText(`+10.0 pts in week ${CLAIM_WEEK}`); // Rice 18 over Najee Harris's 8 from the bench
    await expect(move).toContainText('Add Rashee Rice WR · KC');
    await expect(move).toContainText('in place of Jaylen Waddle (on bye)');
    await expect(move).toContainText('Drop Drake Maye (QB, 36.0 rest of season');
  });

  test('ESPN: open roster spots mean upgrades need no drop', async ({ page }) => {
    await pickLeague(page, ESPN_LEAGUE_NAME);
    const section = leagueSection(page, ESPN_LEAGUE_NAME);
    await expect(section).toContainText(`$${ESPN_FAAB.budget - ESPN_FAAB.spent} of $${ESPN_FAAB.budget} FAAB left · priority ${ESPN_FAAB.waiverRank} of 4`);

    const list = moves(page, ESPN_LEAGUE_NAME);
    await expect(list).toHaveCount(2);
    await expect(list.nth(0)).toContainText('Upgrade · WR');
    await expect(list.nth(0)).toContainText('Add Rashee Rice WR · KC · on waivers');
    await expect(list.nth(0)).toContainText('in place of Malik Nabers (10.0 projected)');
    await expect(list.nth(0)).toContainText('+8.0 pts');
    await expect(list.nth(1)).toContainText('Upgrade · FLEX');
    await expect(list.nth(1)).toContainText('Add Chris Olave WR · NO · free agent');
    await expect(list.nth(1)).toContainText('+4.0 pts');
    for (const i of [0, 1]) await expect(list.nth(i)).toContainText('Uses an open roster spot, no drop needed');
  });

  test('puts leagues in order of their next waiver run, learned from processed claims', async ({ page }) => {
    const pills = page.getByRole('group', { name: 'League' }).getByRole('button');
    await expect(pills.nth(0)).toHaveText(`${SLEEPER_LEAGUE_NAME} · Tue night`); // Wed 3 AM: overnight, so the night before
    await expect(pills.nth(1)).toHaveText(ESPN_LEAGUE_NAME); // no claim history: unknown, so last
    await expect(leagueSection(page, SLEEPER_LEAGUE_NAME)).toContainText(
      /Waivers run Tue night \(Wed 3:00 AM\) ET · next in .+\(learned from this league's processed claims\)/,
    );
    await pickLeague(page, ESPN_LEAGUE_NAME);
    await expect(leagueSection(page, ESPN_LEAGUE_NAME)).toContainText("When waivers run isn't known yet");
  });

  test('best available can be ranked by this week, rest of season or trending adds', async ({ page }) => {
    const section = leagueSection(page, SLEEPER_LEAGUE_NAME);
    await section.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'WR', exact: true }).click();
    const rows = section.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toContainText('Rashee Rice');
    await expect(rows.nth(1)).toContainText('18.0');
    await expect(rows.nth(1)).toContainText('216.0'); // 18 a week, weeks 7 through 18

    await section.getByRole('group', { name: 'Rank by' }).getByRole('button', { name: 'Trending' }).click();
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
    await expect(section).toContainText(`$${FFPC_FAAB_LEFT} FAAB left`);
    await expect(section).toContainText("Waivers run Wed 11:00 PM and Sun 10:00 AM ET · next in"); // FFPC_BID_SCHEDULE, read from the page
    await expect(section).toContainText("(from FFPC's page)");
    await expect(section).toContainText("From FFPC's add/drop page as pasted");

    const list = moves(page, FFPC_TEAM);
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText('Upgrade · WR');
    await expect(list.first()).toContainText('Add Jayden Reed WR · GB');
    await expect(list.first()).toContainText('in place of Mike Evans (6.0 projected)');
    await expect(list.first()).toContainText('+10.0 pts');
    await expect(list.first()).toContainText('Drop Drake Maye (QB, 36.0 rest of season');

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
