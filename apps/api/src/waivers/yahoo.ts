// Waivers for Yahoo leagues. Who's available, and your budget and priority,
// come from Yahoo. Yahoo has no projections, so they're Sleeper's (matched by
// position and name, like the live feed), scored with the league's own Yahoo
// scoring as Sleeper leagues are scored with theirs.

import type { Player, SourceError, WaiverLeague, WaiverPlayer, WaiverRules } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { errorMessage, myYahooTeams, yahooReady } from '../adapters/yahoo/index.js';
import { parseAdds, parseAvailable, parseLeagueSettings, parseRoster, parseWaiverStanding, startersOf, type YahooAdd, type YahooLeagueInfo, type YahooRosterSpot } from '../adapters/yahoo/parse.js';
import { yahooScoring } from '../adapters/yahoo/scoring.js';
import { yahooContestedClaims, YahooCookiesError } from '../adapters/yahoo/web.js';
import { HOUR } from '../cache.js';
import { config } from '../config.js';
import { playerKey } from '../exposure.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { waiverPlayer, type WaiverContext, type WaiverLeagueWithBids } from './context.js';
import { pickAvailable, startablePositions, suggestMoves } from './moves.js';
import { withLosingBids } from './pricing.js';
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
  faabBudget: number | null; // see inferFaabBudget
}

/**
 * The league's FAAB budget, which Yahoo doesn't report: each team's balance
 * plus what it has spent on winning bids, the most common answer across teams
 * (a team given extra budget, or a claim missing from the log, won't skew it).
 */
export function inferFaabBudget(balances: Map<string, { faabBalance: number | null }>, adds: YahooAdd[]): number | null {
  const spent = new Map<string, number>();
  for (const a of adds) if (a.fromWaivers && a.bid) spent.set(a.teamKey, (spent.get(a.teamKey) ?? 0) + a.bid);
  const totals = [...balances].flatMap(([team, s]) => (s.faabBalance == null ? [] : [s.faabBalance + (spent.get(team) ?? 0)]));
  if (totals.length === 0) return null;
  const counts = new Map<number, number>();
  for (const t of totals) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
}

export function yahooRules(input: Pick<YahooWaiverInput, 'settings' | 'standing' | 'teams' | 'faabBudget'>): WaiverRules {
  const faab = input.settings.usesFaab;
  return {
    // Yahoo's default otherwise is a continual rolling list.
    type: faab ? 'faab' : 'rolling',
    faabTotal: faab ? input.faabBudget : null,
    faabLeft: faab ? (input.standing?.faabBalance ?? null) : null,
    priority: input.standing?.priority ?? null,
    teams: input.teams,
  };
}

/** One Yahoo league's waiver view. `sleeperIdOf` finds a player in Sleeper's projections. */
export function yahooWaiverLeague(input: YahooWaiverInput, weeks: Projections[], sleeperIdOf: (p: Player) => string | null, ctx: WaiverContext): WaiverLeagueWithBids {
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
    lineup: { starters, bench },
    openRosterSpots,
    runs: [],
    runsSource: null,
    claims: null,
  };
}

export async function fetchYahooWaivers(ctx: WaiverContext): Promise<{ leagues: WaiverLeagueWithBids[]; errors: SourceError[] }> {
  const result = { leagues: [] as WaiverLeagueWithBids[], errors: [] as SourceError[] };
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
        const added = parseAdds(adds);
        const input: YahooWaiverInput = {
          league,
          settings,
          scoring: yahooScoring(setup),
          standing: standings.get(team.teamKey),
          teams: standings.size,
          roster: parseRoster(roster),
          available: available.flatMap(parseAvailable),
          faabBudget: settings.usesFaab ? inferFaabBudget(standings, added) : null,
        };
        const schedule = yahooSchedule(added, settings.usesFaab, league.currentWeek);
        // Losing bids come from Yahoo's site; trouble there shouldn't cost you the rest of the league.
        const contestedClaims =
          settings.usesFaab && config.yahooCookie
            ? await yahooContestedClaims(league.leagueId, team.teamKey.split('.t.')[1] ?? '', config.yahooCookie).catch((e) => {
                const source = `yahoo-site:${league.leagueKey}`;
                result.errors.push(e instanceof YahooCookiesError ? { source, message: e.message, code: e.code } : { source, message: errorMessage(e) });
                return null;
              })
            : null;
        const rivalBalances = [...standings].flatMap(([key, s]) => (key !== team.teamKey && s.faabBalance != null ? [s.faabBalance] : []));
        result.leagues.push({
          ...yahooWaiverLeague(input, weeks, sleeperIdOf, ctx),
          ...schedule,
          contestedClaims,
          winningBids: withLosingBids(schedule.winningBids ?? [], contestedClaims),
          rivalBalances,
        });
      } catch (e) {
        result.errors.push({ source: `yahoo:${league.leagueKey}`, message: errorMessage(e) });
      }
    }),
  );
  return result;
}
