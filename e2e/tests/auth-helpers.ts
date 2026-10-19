import { createHash } from 'node:crypto';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { GithubUserKey } from '../fixtures/github.js';
import { UPSTREAM_PORT } from '../support/env.js';

/** Who the fake GitHub signs in next (once), or 'cancel' to decline on GitHub's page. */
export async function nextGithubSignIn(as: GithubUserKey | 'cancel') {
  const res = await fetch(`http://127.0.0.1:${UPSTREAM_PORT}/github/_next?as=${as}`, { method: 'POST' });
  if (!res.ok) throw new Error(`fake GitHub refused: ${await res.text()}`);
}

/** Signs in through the real flow: sign-in screen → GitHub → callback → dashboard. */
export async function signIn(page: Page, as: GithubUserKey | 'cancel' = 'owner') {
  await nextGithubSignIn(as);
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
}

export async function expectSignedIn(page: Page, login: string) {
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText(login, { exact: true })).toBeVisible();
}

export const signInScreen = (page: Page) => page.getByRole('link', { name: 'Sign in with GitHub' });

/** The session cookie as the browser holds it, and the hash the database stores for it. */
export async function sessionCookie(context: BrowserContext) {
  const cookie = (await context.cookies()).find((c) => c.name === 'ffd_session');
  if (!cookie) throw new Error('no session cookie');
  return { cookie, hash: createHash('sha256').update(cookie.value).digest('hex') };
}
