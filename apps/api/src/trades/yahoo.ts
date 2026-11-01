// A Yahoo league's trades, scored the same way as Sleeper's (see analyze.ts).
// Who each team had and started that week, and the traded players' points, are
// Yahoo's. Replacement level and rest-of-season projections are Sleeper's, scored
// with the league's Yahoo scoring (yardage bonuses aren't counted).
//
// Calls per load: your teams and leagues (shared with the rest of the dashboard),
// the league's settings, trades, current rosters and calendar, then two per
// finished week since the first trade.

import type { Player, TradeReport, TradesResponse } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { myYahooTeams } from '../adapters/yahoo/index.js';
import { NOT_STARTING, parseGameWeeks, parseLeaguePlayers, parseLeagueRosters, parseLeagueSettings, parseTrades, weekOn, type YahooRosterSpot, type YahooTrade } from '../adapters/yahoo/parse.js';
import { yahooScoring } from '../adapters/yahoo/scoring.js';
import { cached, HOUR } from '../cache.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { sleeperMatcher } from '../waivers/prices.js';
import { analyzeTrade, replacementLevel, type SideInput } from './analyze.js';
import { lastFinishedWeek, pastStats } from './weeks.js';

const PLAYERS_PER_CALL = 25; // Yahoo's most in one answer

export interface YahooTradeWeek {
  rosters: Map<string, YahooRosterSpot[]>; // by team key; slots only, the points are below
  points: Map<string, number>; // the traded players', by Yahoo player id
  replacement: Map<string, number>;
}

export interface YahooTradeInput {
  myTeamKey: string;
  weekOf: (at: Date) => number;
  weeks: Map<number, YahooTradeWeek>; // the finished ones since the first trade
  restOfSeason: (player: Player, teamKey: string) => number | null;
  final: boolean;
}

/** Each trade scored, newest first. Pure: the loader below gathers the weeks. */
export function yahooTradeReports(trades: YahooTrade[], input: YahooTradeInput): TradeReport[] {
  return [...trades]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((t, i) => {
      const tradeWeek = input.weekOf(t.at);
      const side = (team: YahooTrade['teams'][number]): SideInput => ({
        teamName: team.name,
        isMe: team.key === input.myTeamKey,
        received: t.moves
          .filter((m) => m.toTeamKey === team.key)
          .map(({ player }) => ({
            name: player.name,
            position: player.position,
            weeks: new Map(
              [...input.weeks]
                .filter(([w]) => w >= tradeWeek)
                .map(([w, week]) => {
                  const spot = week.rosters.get(team.key)?.find((s) => s.player.playerId === player.playerId);
                  return [w, { points: week.points.get(player.playerId) ?? 0, onRoster: spot != null, started: spot != null && !NOT_STARTING.has(spot.slot) }];
                }),
            ),
            restOfSeason: input.restOfSeason(player, team.key),
          })),
        picks: [],
        faab: 0,
      });
      return analyzeTrade(`${tradeWeek}:${i}`, tradeWeek, [side(t.teams[0]), side(t.teams[1])], (w, pos) => input.weeks.get(w)?.replacement.get(pos) ?? 0, input.final);
    });
}

/** The traded players' points in a week, by Yahoo player id. */
async function tradedPoints(leagueKey: string, players: Player[], week: number): Promise<Map<string, number>> {
  const game = leagueKey.split('.l.')[0];
  const keys = players.map((p) => `${game}.p.${p.playerId.replace('yahoo:', '')}`);
  const calls = Array.from({ length: Math.ceil(keys.length / PLAYERS_PER_CALL) }, (_, i) => keys.slice(i * PLAYERS_PER_CALL, (i + 1) * PLAYERS_PER_CALL));
  const answers = await Promise.all(calls.map((list) => yahooGet(`league/${leagueKey}/players;player_keys=${list.join(',')}/stats;type=week;week=${week}`)));
  return new Map(answers.flatMap(parseLeaguePlayers).map((s) => [s.player.playerId, s.points]));
}

export async function yahooTrades(leagueKey: string): Promise<TradesResponse> {
  const key = `yahoo:${leagueKey}`;
  const found = (await myYahooTeams()).find(({ league }) => league.leagueKey === leagueKey);
  if (!found) return { leagueKey: key, supported: true, trades: [] };
  const { team, league } = found;

  const trades = parseTrades(await yahooGet(`league/${leagueKey}/transactions;types=trade`));
  if (trades.length === 0) return { leagueKey: key, supported: true, trades: [] };

  const [setup, current, calendar, players] = await Promise.all([
    yahooGet(`league/${leagueKey};out=settings`),
    yahooGet(`league/${leagueKey}/teams/roster`),
    yahooGet(`game/${leagueKey.split('.l.')[0]}/game_weeks`),
    sleeperClient.players(),
  ]);
  const scoring = yahooScoring(setup);
  const lastWeek = (parseLeagueSettings(setup).playoffStartWeek ?? 15) - 1;
  const week = league.currentWeek || (await sleeperClient.state()).week;
  const final = week > lastWeek;
  const lastDone = await lastFinishedWeek(league.season, week, lastWeek);
  const rostersNow = parseLeagueRosters(current);

  const gameWeeks = parseGameWeeks(calendar);
  const weekOf = (at: Date) => weekOn(gameWeeks, at) ?? 1; // only the weeks before the season have none
  const first = Math.min(...trades.map((t) => weekOf(t.at)));
  const traded = [...new Map(trades.flatMap((t) => t.moves).map((m) => [m.player.playerId, m.player])).values()];
  const everyone = traded.map((p) => p.playerId).sort().join(',');

  // One week at a time, to go easy on Yahoo. A finished week doesn't change, unless a new trade adds players to it.
  const weeks = new Map<number, YahooTradeWeek>();
  for (let w = first; w <= lastDone; w++) {
    const load = cached(`trades:yahoo:${leagueKey}:${w}:${everyone}`, 6 * HOUR, async (): Promise<YahooTradeWeek> => {
      const [rosters, points, stats] = await Promise.all([
        yahooGet(`league/${leagueKey}/teams/roster;week=${w}`),
        tradedPoints(leagueKey, traded, w),
        pastStats(league.season, w).catch(() => null),
      ]);
      const scores = [...(stats ?? [])].flatMap(([id, s]) => {
        const player = toPlayer(id, players);
        return player ? [{ position: player.position, points: scoreWithSettings(s, scoring) }] : [];
      });
      return { rosters: parseLeagueRosters(rosters), points, replacement: replacementLevel(scores, league.slots, rostersNow.size) };
    });
    weeks.set(w, await load);
  }

  // Rest of season: projections for the weeks left, for players still on the team that got them.
  const match = sleeperMatcher(players);
  const left = Array.from({ length: Math.max(0, lastWeek - lastDone) }, (_, i) => lastDone + 1 + i);
  const projections = await Promise.all(left.map((w) => weeklyProjections(league.season, w, HOUR).catch(() => null)));
  const restOfSeason = (player: Player, teamKey: string) => {
    const id = match.idOf('yahoo', player);
    if (final || !id || !rostersNow.get(teamKey)?.some((s) => s.player.playerId === player.playerId)) return null;
    return projections.reduce((n, p) => n + (p?.get(id) ? scoreWithSettings(p.get(id)!, scoring) : 0), 0);
  };

  return { leagueKey: key, supported: true, trades: yahooTradeReports(trades, { myTeamKey: team.teamKey, weekOf, weeks, restOfSeason, final }) };
}
