// Runs before the other tests: signs in once as the owner and saves the session
// cookie, so every other test starts signed in without repeating the flow.

import { test as setup } from '@playwright/test';
import { OWNER } from '@ffd/demo/fixtures/github';
import { OWNER_STATE } from '../support/env.js';
import { expectSignedIn, signIn } from './auth-helpers.js';

setup('sign in as the owner', async ({ page }) => {
  await signIn(page);
  await expectSignedIn(page, OWNER.login);
  await page.context().storageState({ path: OWNER_STATE });
});
