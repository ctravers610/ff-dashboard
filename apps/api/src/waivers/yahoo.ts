// Waivers for Yahoo leagues. Who's available, and your budget and priority,
// come from Yahoo. Yahoo has no projections, so they're Sleeper's (matched by
// position and name, like the live feed), scored with the league's own Yahoo
// scoring as Sleeper leagues are scored with theirs.

import type { Player, SourceError, WaiverLeague, WaiverPlayer, WaiverRules } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { errorMessage, myYahooTeams, yahooReady } from '../adapters/yahoo/index.js';
import { parseAdds, parseAvailable, parseLeagueSettings, parseRoster, parseWaiverStanding, startersOf, type YahooLeagueInfo, type YahooRosterSpot } from '../adapters/yahoo/parse.js';
import { yahooScoring } from '../adapters/yahoo/scoring.js';
import { HOUR } from '../cache.js';
import { playerKey } from '../exposure.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { waiverPlayer, type WaiverContext } from './context.js';
import { pickAvailable, startablePositions, suggestMoves } from './moves.js';
import { yahooSchedule } from './schedule.js';

type Projections = Map<string, Record<string, number>>;

export interface YahooWaiverInput {
  league: YahooLeagueInfo;
  settings: ReturnType<typeof parseLeagueSettings>;
  scoring: Record<string, number>; // Sleeper-style, from the league's Yahoo scoring
  standing: { priority: number | null; faabBalance: number | null } | undefined;
  teams: number;
  roster: YahooRosterSpot[]; // yours
  available: ReturnType<typeof parseAvailable>;
}

export function yahooRules(input: Pick<YahooWaiverInput, 'settings' | 'standing' | 'teams'>): WaiverRules {
  const faab = input.settings.usesFaab;
  return {
    // Yahoo's default otherwise is a continual rolling list.
    type: faab ? 'faab' : 'rolling',
    faabTotal: null, // Yahoo reports what's left, not the starting budget
    faabLeft: faab ? (input.standing?.faabBalance ?? null) : null,
    priority: input.standing?.priority ?? null,
    teams: input.teams,
  };
}

/** One Yahoo league's waiver view. `sleeperIdOf` finds a player in Sleeper's projections. */
export function yahooWaiverLeague(input: YahooWaiverInput, weeks: Projections[], sleeperIdOf: (p: Player) => string | null, ctx: WaiverContext): WaiverLeague {
  const toWaiver = (player: Player, availability: WaiverPlayer['availability'] = null) => {
    const id = sleeperIdOf(player);
    const perWeek = id ? weeks.map((w) => scoreWithSettings(w.get(id) ?? {}, input.scoring)) : null;
    return waiverPlayer(player, perWeek?.[0] ?? null, perWeek ? perWeek.reduce((a, b) => a + b, 0) : null, ctx, availability);
  };

  const positions = startablePositions(input.league.slots);
  const pool = input.available
    .filter((a) => a.player.nflTeam && positions.has(a.player.position))
    .map((a) => toWaiver(a.player, a.onWaivers == null ? null : a.onWaivers ? 'waivers' : 'free_agent'));
  const available = pickAvailable(pool, positions);

  const starters = startersOf(input.roster, input.league.slots).map((s) => ({ slot: s.slot, player: s.player ? toWaiver(s.player) : null }));
  const bench = input.roster.filter((r) => r.slot === 'BN').map((r) => toWaiver(r.player));
  const active = input.roster.filter((r) => r.slot !== 'IR').length;
  const openRosterSpots = Math.max(0, input.settings.rosterSize - active);

  return {
    leagueId: input.league.leagueKey,
    platform: 'yahoo',
    name: input.league.name,
    rules: yahooRules(input),
    moves: suggestMoves({ starters, bench, available, openRosterSpots, byeTeams: ctx.byeTeams }),
    available,
    openRosterSpots,
    runs: [],
    runsSource: null,
    claims: null,
  };
}

export async function fetchYahooWaivers(ctx: WaiverContext): Promise<{ leagues: WaiverLeague[]; errors: SourceError[] }> {
  const result = { leagues: [] as WaiverLeague[], errors: [] as SourceError[] };
  if (!(await yahooReady())) return result;

  const weekNumbers = Array.from({ length: Math.max(0, ctx.lastWeek - ctx.week + 1) }, (_, i) => ctx.week + i);
  const [players, weeks, mine] = await Promise.all([
    sleeperClient.players(),
    Promise.all(weekNumbers.map((w) => weeklyProjections(ctx.season, w, HOUR))),
    myYahooTeams().catch((e) => {
      result.errors.push({ source: 'yahoo', message: errorMessage(e) });
      return [];
    }),
  ]);
  const sleeperIdByKey = new Map<string, string>();
  for (const id of Object.keys(players)) {
    const p = toPlayer(id, players);
    if (p?.position) sleeperIdByKey.set(playerKey(p), id);
  }
  const sleeperIdOf = (p: Player) => sleeperIdByKey.get(playerKey(p)) ?? null;

  await Promise.all(
    mine.map(async ({ team, league }) => {
      try {
        const positions = [...startablePositions(league.slots)];
        const [setup, teams, roster, adds, ...available] = await Promise.all([
          yahooGet(`league/${league.leagueKey};out=settings`),
          yahooGet(`league/${league.leagueKey}/teams`),
          yahooGet(`team/${team.teamKey}/roster`),
          // Every pickup this season: when claims processed shows when waivers run.
          yahooGet(`league/${league.leagueKey}/transactions;types=add`).catch(() => null),
          // Yahoo's own ranking, best first, at each position the league starts.
          ...positions.map((pos) => yahooGet(`league/${league.leagueKey}/players;status=A;position=${pos};sort=AR;count=25;out=ownership`)),
        ]);
        const standings = parseWaiverStanding(teams);
        const settings = parseLeagueSettings(setup);
        const input: YahooWaiverInput = {
          league,
          settings,
          scoring: yahooScoring(setup),
          standing: standings.get(team.teamKey),
          teams: standings.size,
          roster: parseRoster(roster),
          available: available.flatMap(parseAvailable),
        };
        const schedule = yahooSchedule(parseAdds(adds), settings.usesFaab, league.currentWeek);
        result.leagues.push({ ...yahooWaiverLeague(input, weeks, sleeperIdOf, ctx), ...schedule });
      } catch (e) {
        result.errors.push({ source: `yahoo:${league.leagueKey}`, message: errorMessage(e) });
      }
    }),
  );
  return result;
}
