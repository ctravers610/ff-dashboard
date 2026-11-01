// An ESPN league's trades, scored the same way as Sleeper's (see analyze.ts).
// Everything comes from ESPN, in the league's own scoring: who each team had and
// started that week, the points, the games, and the projections, for weeks ahead
// too. A roster asked for by week adds up to ESPN's own team score for that week.
//
// Calls per load: the trade feed, the league and the traded players, then per week
// from the first trade to the end of the regular season, one for the rosters and
// one for the traded players, who may be on no team by then.

import type { Player, TradeReport, TradesResponse } from '@ffd/shared';
import { ESPN_TRADE_MESSAGE, espnClient } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, SLOT_NAMES, SLOT_ORDER, teamName, toEspnPlayer, weekPoints } from '../adapters/espn/mapper.js';
import type { EspnActivity, EspnLeague, EspnPlayer, EspnScheduleItem } from '../adapters/espn/types.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { cached, HOUR } from '../cache.js';
import { config } from '../config.js';
import { weekOnDate } from '../history.js';
import { activeSources } from '../sources/store.js';
import { projection } from '../waivers/espn.js';
import { analyzeTrade, tradeSide, type LeagueWeeks, type LineupPlayer } from './analyze.js';
import { lastFinishedWeek } from './weeks.js';

export interface EspnTrade {
  at: Date;
  teams: [string, string];
  moves: { playerId: string; toTeamId: string }[];
}

/** The completed trades in ESPN's league activity. */
export function parseEspnTrades(activity: EspnActivity): EspnTrade[] {
  return (activity.topics ?? []).flatMap((topic) => {
    const moved = (topic.messages ?? []).filter((m) => m.messageTypeId === ESPN_TRADE_MESSAGE && m.from != null && m.to != null && m.targetId != null);
    const teams = [...new Set(moved.flatMap((m) => [String(m.from), String(m.to)]))];
    if (teams.length !== 2) return [];
    return [{ at: new Date(topic.date), teams: teams as [string, string], moves: moved.map((m) => ({ playerId: String(m.targetId), toTeamId: String(m.to) })) }];
  });
}

// ESPN's feed gives only the date.
const tradeWeekOf = (season: string, trade: EspnTrade) => weekOnDate(season, trade.at.toISOString().slice(0, 10));

export interface EspnTradeWeek {
  rosters: Map<string, LineupPlayer[]>; // the teams that traded, by team id
  traded: Map<string, { points: number; projected: number | null }>; // by player id
}

/** A week's lineups from ESPN's rosters for that week, and the traded players' lines. */
export function espnTradeWeek(league: EspnLeague, teamIds: Set<string>, tradedPlayers: EspnPlayer[], season: number, week: number): EspnTradeWeek {
  const line = (p: EspnPlayer) => ({ points: weekPoints(p, season, week), projected: projection(p, season, week).week });
  return {
    rosters: new Map(
      (league.teams ?? [])
        .filter((t) => teamIds.has(String(t.id)))
        .map((t) => [
          String(t.id),
          (t.roster?.entries ?? [])
            .filter((e) => e.playerPoolEntry?.player)
            .map((e) => {
              const p = e.playerPoolEntry!.player;
              return { id: String(p.id), position: toEspnPlayer(p).position, ...line(p), started: e.lineupSlotId !== BENCH_SLOT && e.lineupSlotId !== IR_SLOT };
            }),
        ]),
    ),
    traded: new Map(tradedPlayers.map((p) => [String(p.id), line(p)])),
  };
}

export interface EspnTradeInput {
  myTeamId: string | null;
  slots: string[];
  season: string;
  finished: number[]; // since the first trade
  left: number[];
  final: boolean;
  weeks: Map<number, EspnTradeWeek>; // the finished ones and the ones left
  schedule: EspnScheduleItem[];
  teamNames: Map<string, string>;
  players: Map<string, Player>; // the traded ones
}

/** Each trade scored, newest first. Pure: the loader below gathers the weeks. */
export function espnTradeReports(trades: EspnTrade[], input: EspnTradeInput): TradeReport[] {
  const nameOf = (id: string) => input.teamNames.get(id) ?? `Team ${id}`;
  const league: LeagueWeeks = {
    slots: input.slots,
    finished: input.finished,
    left: input.left,
    final: input.final,
    teamWeek: (week, teamId) => {
      const players = input.weeks.get(week)?.rosters.get(teamId);
      if (!players) return null;
      const game = input.schedule.find((g) => g.matchupPeriodId === week && (String(g.home?.teamId) === teamId || String(g.away?.teamId) === teamId));
      const [mine, theirs] = String(game?.home?.teamId) === teamId ? [game?.home, game?.away] : [game?.away, game?.home];
      return {
        players,
        score: mine?.totalPoints ?? 0,
        opponent: theirs ? { id: String(theirs.teamId), name: nameOf(String(theirs.teamId)), score: theirs.totalPoints ?? 0 } : null,
      };
    },
    tradedPlayer: (week, id) => input.weeks.get(week)?.traded.get(id) ?? { points: 0, projected: null },
    rosterAhead: (week, teamId) => input.weeks.get(week)?.rosters.get(teamId) ?? [],
  };

  return [...trades]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((t, i) => {
      const tradeWeek = tradeWeekOf(input.season, t);
      const moves = t.moves.flatMap((m) => {
        const player = input.players.get(m.playerId);
        return player ? [{ id: m.playerId, name: player.name, position: player.position, toTeamId: m.toTeamId }] : [];
      });
      const side = (id: string) => tradeSide({ id, name: nameOf(id), isMe: id === input.myTeamId }, moves, tradeWeek, league);
      return analyzeTrade(`${tradeWeek}:${i}`, tradeWeek, [side(t.teams[0]), side(t.teams[1])], input.final);
    });
}

export async function espnTrades(leagueId: string): Promise<TradesResponse> {
  const key = `espn:${leagueId}`;
  const auth = config.espnAuth;
  if (!auth) throw new Error('Set ESPN_S2 and ESPN_SWID in .env to see ESPN trades');
  if (!(await activeSources()).espnLeagueIds.includes(leagueId)) return { leagueKey: key, supported: true, trades: [] };

  const state = await sleeperClient.state();
  const trades = parseEspnTrades(await espnClient.tradeActivity(leagueId, state.season, auth));
  if (trades.length === 0) return { leagueKey: key, supported: true, trades: [] };

  const league = await espnClient.league(leagueId, state.season, auth);
  const lastWeek = league.settings?.scheduleSettings?.matchupPeriodCount ?? 14;
  const lastDone = await lastFinishedWeek(state.season, state.week, lastWeek);

  const season = Number(state.season);
  const first = Math.min(...trades.map((t) => tradeWeekOf(state.season, t)));
  const finished = Array.from({ length: Math.max(0, lastDone - first + 1) }, (_, i) => first + i);
  const left = Array.from({ length: Math.max(0, lastWeek - lastDone) }, (_, i) => lastDone + 1 + i);
  const ids = [...new Set(trades.flatMap((t) => t.moves.map((m) => Number(m.playerId))))].sort((a, b) => a - b);
  const teamIds = new Set(trades.flatMap((t) => t.teams));

  // A finished week doesn't change, unless a new trade adds players to it. Weeks ahead do.
  const weeks = new Map(
    await Promise.all(
      [...finished, ...left].map(async (w) => {
        const week = await cached(`trades:espn:${leagueId}:${w}:${ids.join(',')}`, w <= lastDone ? 6 * HOUR : HOUR, async () => {
          const [rosters, looked] = await Promise.all([espnClient.rostersForWeek(leagueId, state.season, w, auth), espnClient.players(leagueId, state.season, w, ids, auth)]);
          return espnTradeWeek(rosters, teamIds, looked.players.map((p) => p.player), season, w);
        });
        return [w, week] as const;
      }),
    ),
  );

  const looked = await espnClient.players(leagueId, state.season, state.week, ids, auth);
  const counts = league.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const myTeamId = findMyTeamId(league, auth.swid);
  const reports = espnTradeReports(trades, {
    myTeamId: myTeamId == null ? null : String(myTeamId),
    slots: SLOT_ORDER.flatMap((id) => Array<string>(counts[id] ?? 0).fill(SLOT_NAMES[id] ?? String(id))),
    season: state.season,
    finished,
    left,
    final: state.week > lastWeek,
    weeks,
    schedule: league.schedule ?? [],
    teamNames: new Map((league.teams ?? []).map((t) => [String(t.id), teamName(t)])),
    players: new Map(looked.players.map((p) => [String(p.player.id), toEspnPlayer(p.player)])),
  });
  return { leagueKey: key, supported: true, trades: reports };
}
