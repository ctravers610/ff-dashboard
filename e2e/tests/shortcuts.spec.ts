import { expect, test } from './fixtures.js';
import { openDashboard } from './helpers.js';

const tab = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: new RegExp(`^${name}`) });

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test('1–4 switch tabs, but not while typing', async ({ page }) => {
    await page.keyboard.press('4');
    await expect(tab(page, 'History')).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('3');
    await expect(tab(page, 'Players')).toHaveAttribute('aria-current', 'page');

    await page.getByPlaceholder('Search players').fill('1');
    await expect(tab(page, 'Players')).toHaveAttribute('aria-current', 'page');
  });

  test('j / k and the arrow keys move through the league list', async ({ page }) => {
    await page.keyboard.press('4');
    // The History list starts on its first league; j moves down, k back up.
    const list = page.getByRole('group', { name: 'League' }).getByRole('button');
    const [first, second] = [list.nth(0), list.nth(1)];
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('j');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('k');
    await expect(first).toHaveAttribute('aria-pressed', 'true');

    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toBeFocused();
  });
});
