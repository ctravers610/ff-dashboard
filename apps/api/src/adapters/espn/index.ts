import type { AdapterResult } from '../types.js';
import { espnClient, type EspnAuth } from './client.js';
import { findMyTeamId, toLeagueSummary } from './mapper.js';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchEspnLeagues(
  leagueIds: string[],
  season: string,
  auth: EspnAuth | null,
): Promise<AdapterResult> {
  const result: AdapterResult = { leagues: [], errors: [] };

  await Promise.all(
    leagueIds.map(async (leagueId) => {
      try {
        const league = await espnClient.league(leagueId, season, auth);
        const myTeamId = auth ? findMyTeamId(league, auth.swid) : null;
        if (myTeamId == null) {
          throw new Error(
            auth
              ? `Couldn't find your team in ESPN league ${leagueId} (check ESPN_SWID)`
              : `Set ESPN_SWID in .env so the dashboard knows which team is yours`,
          );
        }
        const member = league.members?.find((m) => m.id.toUpperCase() === auth!.swid.toUpperCase());
        result.leagues.push(
          toLeagueSummary({ league, myTeamId, account: member?.displayName ?? 'espn' }),
        );
      } catch (e) {
        result.errors.push({ source: `espn:${leagueId}`, message: errorMessage(e) });
      }
    }),
  );

  return result;
}
