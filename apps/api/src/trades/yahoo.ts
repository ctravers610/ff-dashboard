// A Yahoo league's trades, scored the same way as Sleeper's (see analyze.ts).
// Who each team had and started that week, the points and the games are Yahoo's.
// Projections are Sleeper's, scored with the league's Yahoo scoring (yardage
// bonuses aren't counted).
//
// Calls per load: your teams and leagues (shared with the rest of the dashboard),
// the league's settings, trades, schedule, current rosters and calendar, then per
// finished week since the first trade, one for each team that traded and one for
// the traded players.

import type { Player, TradeReport, TradesResponse } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { myYahooTeams } from '../adapters/yahoo/index.js';
import { NOT_STARTING, parseGameWeeks, parseLeaguePlayers, parseLeagueRosters, parseLeagueSchedule, parseLeagueSettings, parseRoster, parseTrades, weekOn, type YahooMatchup, type YahooRosterSpot, type YahooTrade } from '../adapters/yahoo/parse.js';
import { yahooScoring } from '../adapters/yahoo/scoring.js';
import { cached, HOUR } from '../cache.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { sleeperMatcher } from '../waivers/prices.js';
import { analyzeTrade, tradeSide, type LeagueWeeks } from './analyze.js';
import { lastFinishedWeek } from './weeks.js';

const PLAYERS_PER_CALL = 25; // Yahoo's most in one answer

export interface YahooTradeWeek {
  rosters: Map<string, YahooRosterSpot[]>; // the teams that traded, by team key
  points: Map<string, number>; // the traded players', by Yahoo player id
}

export interface YahooTradeInput {
  myTeamKey: string;
  slots: string[];
  weekOf: (at: Date) => number;
  weeks: Map<number, YahooTradeWeek>; // the finished ones since the first trade
  left: number[];
  final: boolean;
  schedule: Map<string, YahooMatchup[]>; // by team key
  rostersNow: Map<string, YahooRosterSpot[]>; // by team key
  projected: (week: number, player: Player) => number | null;
}

/** Each trade scored, newest first. Pure: the loader below gathers the weeks. */
export function yahooTradeReports(trades: YahooTrade[], input: YahooTradeInput): TradeReport[] {
  const traded = new Map(trades.flatMap((t) => t.moves).map((m) => [m.player.playerId, m.player]));
  const league: LeagueWeeks = {
    slots: input.slots,
    finished: [...input.weeks.keys()],
    left: input.left,
    final: input.final,
    teamWeek: (week, teamKey) => {
      const spots = input.weeks.get(week)?.rosters.get(teamKey);
      if (!spots) return null;
      const game = input.schedule.get(teamKey)?.find((m) => m.week === week);
      return {
        players: spots.map((s) => ({ id: s.player.playerId, position: s.player.position, points: s.points, projected: input.projected(week, s.player), started: !NOT_STARTING.has(s.slot) })),
        score: game?.me.points ?? 0,
        opponent: game?.opponent ? { id: game.opponent.teamKey, name: game.opponent.teamName, score: game.opponent.points } : null,
      };
    },
    tradedPlayer: (week, id) => ({ points: input.weeks.get(week)?.points.get(id) ?? 0, projected: input.projected(week, traded.get(id)!) }),
    rosterAhead: (week, teamKey) => (input.rostersNow.get(teamKey) ?? []).map((s) => ({ id: s.player.playerId, position: s.player.position, projected: input.projected(week, s.player) })),
  };

  return [...trades]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((t, i) => {
      const tradeWeek = input.weekOf(t.at);
      const moves = t.moves.map((m) => ({ id: m.player.playerId, name: m.player.name, position: m.player.position, toTeamId: m.toTeamKey }));
      const side = (team: YahooTrade['teams'][number]) => tradeSide({ id: team.key, name: team.name, isMe: team.key === input.myTeamKey }, moves, tradeWeek, league);
      return analyzeTrade(`${tradeWeek}:${i}`, tradeWeek, [side(t.teams[0]), side(t.teams[1])], input.final);
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

  const [setup, current, schedule, calendar, players] = await Promise.all([
    yahooGet(`league/${leagueKey};out=settings`),
    yahooGet(`league/${leagueKey}/teams/roster`),
    yahooGet(`league/${leagueKey}/teams/matchups`),
    yahooGet(`game/${leagueKey.split('.l.')[0]}/game_weeks`),
    sleeperClient.players(),
  ]);
  const scoring = yahooScoring(setup);
  const lastWeek = (parseLeagueSettings(setup).playoffStartWeek ?? 15) - 1;
  const week = league.currentWeek || (await sleeperClient.state()).week;
  const lastDone = await lastFinishedWeek(league.season, week, lastWeek);

  const gameWeeks = parseGameWeeks(calendar);
  const weekOf = (at: Date) => weekOn(gameWeeks, at) ?? 1; // only the weeks before the season have none
  const first = Math.min(...trades.map((t) => weekOf(t.at)));
  const traded = [...new Map(trades.flatMap((t) => t.moves).map((m) => [m.player.playerId, m.player])).values()];
  const teamKeys = [...new Set(trades.flatMap((t) => t.teams.map((x) => x.key)))];
  const everyone = traded.map((p) => p.playerId).sort().join(',');

  // One week at a time, to go easy on Yahoo. A finished week doesn't change, unless a new trade adds players to it.
  const weeks = new Map<number, YahooTradeWeek>();
  for (let w = first; w <= lastDone; w++) {
    const load = cached(`trades:yahoo:${leagueKey}:${w}:${everyone}`, 6 * HOUR, async (): Promise<YahooTradeWeek> => {
      const [rosters, points] = await Promise.all([
        Promise.all(teamKeys.map(async (k) => [k, parseRoster(await yahooGet(`team/${k}/roster;week=${w}/players/stats;type=week;week=${w}`))] as const)),
        tradedPoints(leagueKey, traded, w),
      ]);
      return { rosters: new Map(rosters), points };
    });
    weeks.set(w, await load);
  }

  const left = Array.from({ length: Math.max(0, lastWeek - lastDone) }, (_, i) => lastDone + 1 + i);
  const projections = new Map(
    await Promise.all([...weeks.keys(), ...left].map(async (w) => [w, await weeklyProjections(league.season, w, HOUR).catch(() => null)] as const)),
  );
  const match = sleeperMatcher(players);
  const projected = (w: number, player: Player) => {
    const stats = projections.get(w);
    const id = match.idOf('yahoo', player);
    return stats && id ? scoreWithSettings(stats.get(id) ?? {}, scoring) : null;
  };

  const reports = yahooTradeReports(trades, {
    myTeamKey: team.teamKey,
    slots: league.slots,
    weekOf,
    weeks,
    left,
    final: week > lastWeek,
    schedule: parseLeagueSchedule(schedule),
    rostersNow: parseLeagueRosters(current),
    projected,
  });
  return { leagueKey: key, supported: true, trades: reports };
}
