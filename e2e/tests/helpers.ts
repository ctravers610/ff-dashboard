import { expect, type Locator, type Page } from '@playwright/test';

export const pts = (n: number) => n.toFixed(2);

/** The dashboard card for a league, found by its heading. */
export const leagueCard = (page: Page, name: string): Locator =>
  page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

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

// The tab labels are lowercase in the DOM and capitalized by CSS, so match case-insensitively.
export const openTab = (page: Page, name: 'Leagues' | 'Players' | 'History') =>
  page
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^${name}$`, 'i') })
    .click();
