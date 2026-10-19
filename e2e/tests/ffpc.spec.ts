import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { FFPC_ME_POINTS, FFPC_LEAGUE, FFPC_OPP, FFPC_TEAM, ME, OPP, livePage } from '../fixtures/ffpc.js';
import { leagueCard, openDashboard, openLeague, paste, pts } from './helpers.js';

// FFPC has no usable API, so its leagues come from pasting the Live Scoring page.
// Scores are then worked out live from real-time stats using FFPC's own rules.
// Add league → FFPC opens the paste-based editor.
const addButton = (page: Page) => ({
  click: async () => {
    await page.getByRole('button', { name: '+ Add league' }).click();
    await page.getByRole('dialog', { name: 'Add a league' }).getByRole('button', { name: /^FFPC/ }).click();
  },
});
const dialog = (page: Page) => page.locator('form').filter({ has: page.getByRole('heading', { name: /FFPC (league|roster)/ }) });
const rosterBox = (page: Page) => dialog(page).getByPlaceholder(/^QB Josh Allen/);
const livePasteBox = (page: Page) => dialog(page).getByPlaceholder(/Live Scoring page here|Paste again/);

/** Adds the fixture league through the dialog, exactly as a user would. */
async function importLeague(page: Page) {
  await addButton(page).click();
  await paste(livePasteBox(page), livePage());
  await expect(dialog(page).getByText(/^Imported week 6/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Add FFPC league' })).toBeHidden();
  await expect(leagueCard(page, FFPC_TEAM)).toBeVisible();
}

test.describe('FFPC league import', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('one paste of the Live Scoring page fills in the league, team, roster and matchup', async ({ page }) => {
    await addButton(page).click();
    await paste(livePasteBox(page), livePage());

    await expect(dialog(page).getByText(`Imported week 6: your 12 players and your matchup vs ${FFPC_OPP}.`)).toBeVisible();
    await expect(dialog(page).getByLabel('League name')).toHaveValue(FFPC_LEAGUE);
    await expect(dialog(page).getByLabel('Your team name')).toHaveValue(FFPC_TEAM);

    const roster = (await rosterBox(page).inputValue()).split('\n');
    expect(roster).toHaveLength(12); // 10 starters + 2 bench
    expect(roster.slice(0, 3)).toEqual(['QB Josh Allen', 'RB Bijan Robinson', 'RB Najee Harris']);
    expect(roster).toContain('K Cam Little');
    expect(roster).toContain('DEF BUF DST');
    expect(roster.slice(-2)).toEqual(['BN Drake Maye', 'BN Jonathon Brooks']);
    await expect(dialog(page).getByText(new RegExp(`Week 6: ${FFPC_TEAM} .* vs ${FFPC_OPP}`))).toBeVisible();
  });

  test('scores both lineups live from real-time stats, not from the pasted zeros', async ({ page }) => {
    await importLeague(page);
    const card = await openLeague(page, FFPC_TEAM);

    // The pasted page shows 0.00 for everyone; these totals come only from the stats feed.
    await expect(card).toContainText('Live from real-time stats scored with FFPC rules');
    await expect(card).toContainText(pts(FFPC_ME_POINTS)); // 146.70, worked out by hand in fixtures/ffpc.ts

    await card.getByRole('button', { name: 'Lineups' }).click();
    const rows = card.locator('div.divide-y > div.grid');
    await expect(rows).toHaveCount(ME.length);
    for (const [i, mine] of ME.entries()) {
      const theirs = OPP[i]!;
      const row = rows.nth(i);
      await expect(row, `${mine.player.name} vs ${theirs.player.name}`).toContainText(mine.player.name);
      await expect(row).toContainText(pts(mine.expected));
      await expect(row).toContainText(theirs.player.name);
      await expect(row).toContainText(pts(theirs.expected));
    }
  });

  test('week 6 is an all-play week: my rank against the whole league, with the win line', async ({ page }) => {
    await importLeague(page);
    const card = await openLeague(page, FFPC_TEAM);

    await expect(card).toContainText('All-play week · top 3 of 6 win');
    await expect(card).toContainText('3rd of 6'); // Alpha 160, Bravo 150, then my live 146.70
    await expect(card).toContainText('40.70 pts above the win line'); // 146.70 - my 106.00 opponent just below the line
    await expect(card).toContainText('projected to finish 3rd');

    await card.getByRole('button', { name: 'All-play', exact: true }).click();
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(7); // header + 6 teams
    await expect(rows.nth(1)).toContainText('Alpha Dogs');
    await expect(rows.nth(3)).toContainText(FFPC_TEAM); // third, highlighted, marked live
    await expect(rows.nth(3)).toContainText('live');
    await expect(rows.nth(3)).toContainText(pts(FFPC_ME_POINTS));
    await expect(rows.nth(1)).not.toContainText('live'); // other teams keep their pasted score
  });

  test('is stored in the database, so it survives a reload', async ({ page, request }) => {
    await importLeague(page);
    await page.reload();
    await expect(leagueCard(page, FFPC_TEAM)).toBeVisible();
    await expect(leagueCard(page, FFPC_TEAM)).toContainText(pts(FFPC_ME_POINTS));

    const stored = (await (await request.get('/api/manual-leagues')).json()) as { name: string }[];
    expect(stored.map((l) => l.name)).toEqual([FFPC_LEAGUE]);
  });

  test('the Roster tab groups starters and bench', async ({ page }) => {
    await importLeague(page);
    const card = await openLeague(page, FFPC_TEAM);
    await card.getByRole('button', { name: 'Roster', exact: true }).click();
    await expect(card).toContainText('Starters');
    await expect(card).toContainText('Josh Allen');
    await expect(card).toContainText('Bench');
    await expect(card).toContainText('Drake Maye');
  });

  test('editing keeps injured-reserve players when the page is pasted again', async ({ page }) => {
    await importLeague(page);
    const card = await openLeague(page, FFPC_TEAM);

    // The Live Scoring page has no IR section, so IR players are added by hand...
    await card.getByRole('button', { name: 'Edit roster' }).click();
    await expect(dialog(page).getByRole('heading', { name: 'Edit FFPC roster' })).toBeVisible();
    const current = await rosterBox(page).inputValue();
    await rosterBox(page).fill(`${current}\nIR Najee Harris`);

    // ...and must survive the next weekly paste.
    await paste(livePasteBox(page), livePage());
    await expect(rosterBox(page)).toHaveValue(/IR Najee Harris$/);
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Edit FFPC roster' })).toBeHidden();

    await card.getByRole('button', { name: 'Roster', exact: true }).click();
    await expect(card.getByText('IR', { exact: true })).toBeVisible();
  });

  test('is shown by team name, and both names can be changed in the edit dialog', async ({ page }) => {
    await importLeague(page);
    await (await openLeague(page, FFPC_TEAM)).getByRole('button', { name: 'Edit roster' }).click();
    await expect(dialog(page).getByLabel('League name')).toHaveValue(FFPC_LEAGUE); // prefilled from the database

    await dialog(page).getByLabel('League name').fill('Renamed Tourney');
    await dialog(page).getByLabel('Your team name').fill('Renamed Club');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    // FFPC tournaments share a name, so the row is labeled by your team; the tournament shows in its details.
    const card = await openLeague(page, 'Renamed Club');
    await expect(card).toContainText('Renamed Tourney · entered manually');
    await expect(leagueCard(page, FFPC_TEAM)).toHaveCount(0);
  });

  test('names a player it could not find, so the spelling can be fixed', async ({ page }) => {
    await addButton(page).click();
    await dialog(page).getByLabel('League name').fill('Typo League');
    await rosterBox(page).fill('QB Josh Allen\nWR Nobody Realname\nBN Najee Harris');
    await dialog(page).getByRole('button', { name: 'Save' }).click();

    const card = await openLeague(page, 'Typo League');
    await expect(card).toContainText("Couldn't find: Nobody Realname");
    await card.getByRole('button', { name: 'Roster', exact: true }).click();
    await expect(card).toContainText('Josh Allen'); // the rest still imported
  });

  test('rejects a page that is not the Live Scoring page', async ({ page }) => {
    await addButton(page).click();
    await paste(livePasteBox(page), 'this is just some text, not an FFPC page');
    await expect(dialog(page).getByText("That doesn't look like an FFPC Live Scoring page.")).toBeVisible();
  });

  test('requires a league name', async ({ page, request }) => {
    await addButton(page).click();
    await rosterBox(page).fill('QB Josh Allen');
    await dialog(page).getByRole('button', { name: 'Save' }).click();

    await expect(dialog(page).getByLabel('League name')).toBeFocused(); // the browser stops the submit
    expect(await (await request.get('/api/manual-leagues')).json()).toEqual([]);
  });

  test('Cancel closes the dialog without saving anything', async ({ page, request }) => {
    await addButton(page).click();
    await dialog(page).getByLabel('League name').fill('Never Saved');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Add FFPC league' })).toBeHidden();
    expect(await (await request.get('/api/manual-leagues')).json()).toEqual([]);
  });

  test.describe('deleting', () => {
    const openEditor = async (page: Page) => {
      await importLeague(page);
      await (await openLeague(page, FFPC_TEAM)).getByRole('button', { name: 'Edit roster' }).click();
    };
    const confirmWith = (page: Page, answer: 'accept' | 'dismiss') =>
      page.once('dialog', (d) => (answer === 'accept' ? d.accept() : d.dismiss()));

    test('asks first, and keeps the league if you say no', async ({ page }) => {
      await openEditor(page);
      confirmWith(page, 'dismiss');
      await dialog(page).getByRole('button', { name: 'Delete league' }).click();
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(leagueCard(page, FFPC_TEAM)).toBeVisible();
    });

    test('removes the league and its history when confirmed', async ({ page, request }) => {
      await openEditor(page);
      confirmWith(page, 'accept');
      await dialog(page).getByRole('button', { name: 'Delete league' }).click();

      await expect(leagueCard(page, FFPC_TEAM)).toHaveCount(0);
      expect(await (await request.get('/api/manual-leagues')).json()).toEqual([]);
      const history = (await (await request.get('/api/history')).json()) as { leagues: { platform: string }[] };
      expect(history.leagues.some((l) => l.platform === 'ffpc')).toBe(false);
    });
  });
});
