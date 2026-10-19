import { test as base } from '@playwright/test';
import { resetFfpc } from '../support/database.js';

export { expect } from '@playwright/test';

/**
 * `test` with a clean slate guaranteed: before every test, any FFPC leagues (the only
 * data tests create) and their history are cleared, so no test depends on what an
 * earlier one left behind and each can run on its own or in any order.
 */
export const test = base.extend<{ cleanSlate: void }>({
  cleanSlate: [
    async ({}, use) => {
      await resetFfpc();
      await use();
    },
    { auto: true },
  ],
});
