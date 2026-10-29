import { nflGames } from '../../scoring/games.js';
import type { AdapterResult } from '../types.js';
import { espnClient, espnSourceError, type EspnAuth } from './client.js';
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
        // Game clocks for per-player live projections; optional if the scoreboard is down.
        const games = await nflGames(season, league.scoringPeriodId).catch(() => null);
        const progressFor = games
          ? (team: string | null) => (team ? (games.get(team)?.progress ?? 0) : 0)
          : undefined;
        result.leagues.push(
          toLeagueSummary({ league, myTeamId, account: member?.displayName ?? 'espn', progressFor }),
        );
      } catch (e) {
        result.errors.push(espnSourceError(leagueId, e));
      }
    }),
  );

  return result;
}
