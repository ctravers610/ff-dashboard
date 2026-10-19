import { expect, type Locator, type Page } from '@playwright/test';

export const pts = (n: number) => n.toFixed(2);

/** A league, found by name: its row on the Matchups tab, or its card on the History tab. */
export const leagueCard = (page: Page, name: string): Locator => page.getByRole('article', { name, exact: true });

/** Opens a league's row on the Matchups tab (lineups, standings, roster) and returns it. */
export async function openLeague(page: Page, name: string): Promise<Locator> {
  const card = leagueCard(page, name);
  const toggle = card.locator('button[aria-expanded]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return card;
}

/** Opens the app and waits until the dashboard data has loaded. */
export async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fantasy Dashboard' })).toBeVisible();
  await expect(page.getByText('Loading your leagues…')).toBeHidden();
}

/**
 * Pastes text into a field the way a user's Ctrl+V would. The clipboard itself
 * is off limits to tests, so this dispatches the paste event with the text attached.
 */
export const paste = (field: Locator, text: string) =>
  field.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

export const openTab = (page: Page, name: 'Matchups' | 'Waivers' | 'Players' | 'History') =>
  page
    .getByRole('navigation')
    // The name can carry a note after the label, e.g. "Waivers (1 league needs your claims)".
    .getByRole('button', { name: new RegExp(`^${name}( \\(|$)`, 'i') })
    .click();
