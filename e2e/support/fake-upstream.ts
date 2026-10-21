// Started by Playwright: the fake Sleeper, ESPN and GitHub (see @ffd/demo).

import { createFakeUpstream } from '@ffd/demo';
import { UPSTREAM_PORT } from './env.js';

createFakeUpstream().listen(UPSTREAM_PORT, '127.0.0.1', () => console.log(`fake upstream on :${UPSTREAM_PORT}`));
