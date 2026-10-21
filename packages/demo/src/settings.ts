// The accounts and leagues the demo follows: the fixture ones, served by the
// fake upstream. The second fixture ESPN league (the one that always refuses)
// is left out, so the demo shows no errors.

import { ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID } from './fixtures/espn.js';
import { SLEEPER_USERNAME } from './fixtures/sleeper.js';

/** Where each service lives on the fake upstream at `base` (e.g. http://127.0.0.1:3099). */
export function demoSettings(base: string) {
  return {
    sleeperUsernames: [SLEEPER_USERNAME],
    espnLeagueIds: [ESPN_LEAGUE_ID],
    espnAuth: { espnS2: ESPN_S2, swid: ESPN_SWID },
    upstream: {
      sleeperApi: `${base}/sleeper/v1`,
      sleeperStats: `${base}/sleeper-stats`,
      espnFantasy: `${base}/espn/fantasy`,
      espnScoreboard: `${base}/espn/scoreboard`,
    },
  };
}
