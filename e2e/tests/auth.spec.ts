import { INTRUDER, OWNER } from '@ffd/demo/fixtures/github';
import { SLEEPER_LEAGUE_NAME, SLEEPER_MY_TEAM } from '@ffd/demo/fixtures/sleeper';
import { withDb } from '../support/database.js';
import { expectSignedIn, sessionCookie, signIn, signInScreen } from './auth-helpers.js';
import { expect, test } from './fixtures.js';
import { leagueCard } from './helpers.js';

// These tests are about signing in, so each starts signed out in its own browser.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sign-in', () => {
  test('signed out, the app shows only the sign-in screen and the API refuses data', async ({ page, request }) => {
    await page.goto('/');
    await expect(signInScreen(page)).toBeVisible();
    await expect(page.getByText(SLEEPER_LEAGUE_NAME)).toHaveCount(0);

    for (const path of ['/api/dashboard', '/api/history', '/api/manual-leagues', '/api/auth/yahoo/status']) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    expect(await (await request.get('/api/auth/me')).json()).toEqual({ authEnabled: true, demo: false, user: null });
    expect((await request.get('/api/health')).status()).toBe(200);
  });

  test('the owner signs in with GitHub and sees the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL('/');
    await expectSignedIn(page, OWNER.login);
    await expect(leagueCard(page, SLEEPER_MY_TEAM)).toBeVisible();
  });

  test('the session cookie is HttpOnly and SameSite=Lax, so page scripts cannot read it', async ({ page, context }) => {
    await signIn(page);
    await expectSignedIn(page, OWNER.login);
    const { cookie } = await sessionCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('ffd_session');
  });

  test('any other GitHub account is turned away, and no session is created', async ({ page, context }) => {
    await signIn(page, 'intruder');
    await expect(page).toHaveURL('/?login=denied');
    await expect(page.getByRole('alert')).toHaveText("That GitHub account isn't allowed to view this dashboard.");
    await expect(signInScreen(page)).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).not.toContain('ffd_session');

    const rows = await withDb((db) => db.query('SELECT 1 FROM sessions WHERE github_id = $1', [INTRUDER.id]));
    expect(rows.rowCount).toBe(0);
  });

  test('cancelling on GitHub comes back to the sign-in screen with a note', async ({ page }) => {
    await signIn(page, 'cancel');
    await expect(page).toHaveURL('/?login=cancelled');
    await expect(page.getByRole('status')).toHaveText('Sign-in was cancelled.');
    await expect(signInScreen(page)).toBeVisible();
  });

  test('a callback this browser did not start (forged or replayed state) is refused', async ({ page, context }) => {
    // A valid code, but no matching state cookie: what a login-CSRF link looks like.
    const res = await page.goto('/api/auth/github/callback?code=code-owner&state=forged');
    expect(res?.status()).toBe(400);
    await expect(page.getByText('Sign-in link expired or invalid')).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).not.toContain('ffd_session');
  });

  test('signing out ends the session on the server too', async ({ page, context }) => {
    await signIn(page);
    await expectSignedIn(page, OWNER.login);
    const { cookie, hash } = await sessionCookie(context);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(signInScreen(page)).toBeVisible();

    // A copy of the old cookie is useless now: the session is gone from the database.
    const rows = await withDb((db) => db.query('SELECT 1 FROM sessions WHERE token_hash = $1', [hash]));
    expect(rows.rowCount).toBe(0);
    await context.addCookies([cookie]);
    expect((await page.request.get('/api/dashboard')).status()).toBe(401);
  });

  test('when the session expires, the next refresh switches to the sign-in screen', async ({ page, context }) => {
    await signIn(page);
    await expectSignedIn(page, OWNER.login);
    const { hash } = await sessionCookie(context);
    await withDb((db) => db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [hash]));

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(signInScreen(page)).toBeVisible();
  });

  test('a cross-site request that changes data is refused, even with a valid session', async ({ page, context }) => {
    await signIn(page);
    await expectSignedIn(page, OWNER.login);

    const res = await context.request.post('/api/manual-leagues', {
      headers: { Origin: 'https://evil.example' },
      data: { name: 'Planted', teamName: 'x', rosterText: 'QB Josh Allen', matchup: null },
    });
    expect(res.status()).toBe(403);
    const rows = await withDb((db) => db.query("SELECT 1 FROM manual_leagues WHERE name = 'Planted'"));
    expect(rows.rowCount).toBe(0);
  });
});
