// The public demo's startup (DEMO_MODE=1, see config.ts): start the fake
// Sleeper/ESPN on a loopback port the config already points at, and give the
// demo an FFPC league, made the way the paste boxes would make it (its Live
// Scoring page and its add/drop page).

import { createFakeUpstream } from '@ffd/demo';
import { livePage } from '@ffd/demo/fixtures/ffpc';
import { ffpcWaiverPage } from '@ffd/demo/fixtures/waivers';
import { convertFfpcLivePage } from '@ffd/shared';
import { manualLeagueRepo } from './adapters/manual/store.js';

export async function startDemo(upstreamPort: number): Promise<void> {
  const server = createFakeUpstream({ testHooks: false });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(upstreamPort, '127.0.0.1', () => resolve());
  });
  server.unref();

  if ((await manualLeagueRepo.list()).length > 0) return;
  const page = convertFfpcLivePage(livePage());
  if (!page) throw new Error('The demo FFPC page was not recognized');
  const league = await manualLeagueRepo.create({
    name: page.leagueName ?? 'Demo FFPC league',
    teamName: page.teamName ?? 'Demo team',
    rosterText: page.rosterText,
    matchup: page.matchup,
  });
  await manualLeagueRepo.setWaivers(league.id, ffpcWaiverPage());
}
