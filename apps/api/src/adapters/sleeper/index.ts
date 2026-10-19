import type { LeagueSummary } from '@ffd/shared';
import type { AdapterResult } from '../types.js';
import { sleeperClient } from './client.js';
import { toLeagueSummary } from './mapper.js';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchSleeperLeagues(usernames: string[]): Promise<AdapterResult> {
  const result: AdapterResult = { leagues: [], errors: [] };
  if (usernames.length === 0) return result;

  const [state, players] = await Promise.all([sleeperClient.state(), sleeperClient.players()]);

  // Load every account in parallel; one bad username shouldn't hide the others.
  await Promise.all(
    usernames.map(async (username) => {
      try {
        const user = await sleeperClient.user(username);
        if (!user?.user_id) throw new Error(`Sleeper user "${username}" was not found`);

        const leagues = await sleeperClient.leagues(user.user_id, state.season);
        const summaries = await Promise.all(
          leagues.map(async (league): Promise<LeagueSummary | null> => {
            const [users, rosters, matchups] = await Promise.all([
              sleeperClient.leagueUsers(league.league_id),
              sleeperClient.rosters(league.league_id),
              state.week > 0 ? sleeperClient.matchups(league.league_id, state.week) : [],
            ]);
            return toLeagueSummary({
              account: user.display_name || username,
              myUserId: user.user_id,
              week: state.week,
              league,
              users,
              rosters,
              matchups,
              players,
            });
          }),
        );
        for (const s of summaries) if (s) result.leagues.push(s);
      } catch (e) {
        result.errors.push({ source: `sleeper:${username}`, message: errorMessage(e) });
      }
    }),
  );

  return result;
}

export async function sleeperNflState() {
  const state = await sleeperClient.state();
  return { season: state.season, week: state.week };
}
