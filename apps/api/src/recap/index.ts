// GET /api/recap: for a finished week, each league's score against the best
// lineup your roster could have fielded, the start/sit calls that cost you,
// and free agents who'd have beaten your starters.

import type { LineupRecap, Player, RecapResponse, RecapSeasonLeague, RecapSeasonResponse, SourceError } from '@ffd/shared';
import { espnClient, espnSourceError, type EspnAuth } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, SLOT_NAMES, SLOT_ORDER, toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnPlayer } from '../adapters/espn/types.js';
import { buildPlayerIndex, parseRosterText, resolvePlayer } from '../adapters/manual/parse.js';
import { manualLeagueRepo } from '../adapters/manual/store.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { myYahooTeams, yahooReady } from '../adapters/yahoo/index.js';
import { parseLeaguePlayers, parseMatchup, parseRoster } from '../adapters/yahoo/parse.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import { cached, HOUR, MINUTE } from '../cache.js';
import { config } from '../config.js';
import { nflGames } from '../scoring/games.js';
import { fetchStats, liveScorer } from '../scoring/live.js';
import { scoreWithSettings } from '../scoring/projection.js';
import { FFPC_RULES } from '../scoring/rules.js';
import { activeSources } from '../sources/store.js';
import { startablePositions } from '../waivers/moves.js';
import { costlyCalls, lineupTotals, missedPickups, type RosteredPlayer } from './lineup.js';

const round1 = (n: number) => Math.round(n * 10) / 10;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// A finished week's stats don't change, so they can be kept for hours.
const pastStats = (season: string, week: number) => cached(`recap:stats:${season}:${week}`, 6 * HOUR, () => fetchStats(season, week));

function outcome(points: number, opponent: number | null): LineupRecap['result'] {
  if (opponent == null) return null;
  return points > opponent ? 'win' : points < opponent ? 'loss' : 'tie';
}

function recap(base: Pick<LineupRecap, 'platform' | 'leagueId' | 'leagueName' | 'week'>, slots: string[], players: RosteredPlayer[], official: number | null, opponentPoints: number | null, missed: LineupRecap['missedPickups'], pickupsNote: string | null): LineupRecap {
  const totals = lineupTotals(slots, players);
  const points = official ?? totals.points;
  const best = Math.max(totals.best, points);
  const result = outcome(points, opponentPoints);
  return {
    ...base,
    points: round1(points),
    best: round1(best),
    leftOnBench: round1(best - points),
    opponentPoints: opponentPoints == null ? null : round1(opponentPoints),
    result,
    bestWouldWin: result === 'loss' && opponentPoints != null && best > opponentPoints,
    calls: costlyCalls(slots, players),
    missedPickups: missed,
    pickupsNote,
  };
}

async function sleeperRecaps(season: string, week: number): Promise<LineupRecap[]> {
  const { sleeperUsernames } = await activeSources();
  // Without that week's stats there's just no waiver comparison; the rest still works.
  const [players, stats] = await Promise.all([sleeperClient.players(), pastStats(season, week).catch(() => null)]);
  const out: LineupRecap[] = [];
  const seen = new Set<string>();
  for (const username of sleeperUsernames) {
    const user = await sleeperClient.user(username);
    if (!user?.user_id) continue;
    for (const league of await sleeperClient.leagues(user.user_id, season)) {
      if (seen.has(league.league_id)) continue;
      seen.add(league.league_id);
      const [rosters, matchups] = await Promise.all([sleeperClient.rosters(league.league_id), sleeperClient.matchups(league.league_id, week)]);
      const mineRoster = rosters.find((r) => r.owner_id === user.user_id || r.co_owners?.includes(user.user_id));
      const mine = matchups.find((m) => m.roster_id === mineRoster?.roster_id);
      if (!mineRoster || !mine) continue;
      const opp = matchups.find((m) => m.matchup_id != null && m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);

      const slots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));
      const startedAt = new Map((mine.starters ?? []).map((id, i) => [id, slots[i] ?? null]));
      const sidelined = new Set([...(mineRoster.reserve ?? []), ...(mineRoster.taxi ?? [])]);
      const rows = mine;
      const rostered: RosteredPlayer[] = (rows.players ?? [])
        .filter((id) => !sidelined.has(id) || startedAt.has(id))
        .flatMap((id) => {
          const player = toPlayer(id, players);
          return player ? [{ player, points: rows.players_points?.[id] ?? 0, startedAt: startedAt.get(id) ?? null }] : [];
        });

      // Everyone on any team in the league that week; the rest were available.
      const taken = new Set(matchups.flatMap((m) => m.players ?? []));
      const positions = startablePositions(slots);
      const scoring = league.scoring_settings ?? {};
      const freeAgents: RosteredPlayer[] = [...(stats?.entries() ?? [])].flatMap(([id, s]) => {
        const player = taken.has(id) ? null : toPlayer(id, players);
        if (!player || !positions.has(player.position)) return [];
        const points = scoreWithSettings(s, scoring);
        return points > 0 ? [{ player, points, startedAt: null }] : [];
      });

      out.push(
        recap(
          { platform: 'sleeper', leagueId: league.league_id, leagueName: league.name, week },
          slots,
          rostered,
          mine.points ?? null,
          opp?.points ?? null,
          stats ? missedPickups(slots, rostered, freeAgents) : null,
          stats ? null : "That week's stats couldn't be loaded, so free agents aren't compared.",
        ),
      );
    }
  }
  return out;
}

const weekPoints = (p: EspnPlayer, season: number, week: number) =>
  p.stats?.find((s) => (s.seasonId ?? season) === season && s.scoringPeriodId === week && s.statSourceId === 0 && (s.statSplitTypeId ?? 1) === 1)?.appliedTotal ?? 0;

async function espnRecaps(season: string, week: number, auth: EspnAuth | null, errors: SourceError[]): Promise<LineupRecap[]> {
  const { espnLeagueIds } = await activeSources();
  if (!auth) return [];
  const out: LineupRecap[] = [];
  // One league failing (expired access, a deleted league) mustn't hide the others.
  for (const leagueId of espnLeagueIds) {
    try {
      const r = await espnRecap(leagueId, season, week, auth);
      if (r) out.push(r);
    } catch (e) {
      errors.push(espnSourceError(leagueId, e));
    }
  }
  return out;
}

async function espnRecap(leagueId: string, season: string, week: number, auth: EspnAuth): Promise<LineupRecap | null> {
  const [league, schedule, freeAgentList] = await Promise.all([
    espnClient.rostersForWeek(leagueId, season, week, auth),
    espnClient.league(leagueId, season, auth),
    espnClient.freeAgents(leagueId, season, week, auth),
  ]);
  const myTeamId = findMyTeamId(league, auth.swid);
  const me = league.teams?.find((t) => t.id === myTeamId);
  if (myTeamId == null || !me) return null;

  const counts = league.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const slots = SLOT_ORDER.flatMap((id) => Array<string>(counts[id] ?? 0).fill(SLOT_NAMES[id] ?? String(id)));
  const rostered: RosteredPlayer[] = (me.roster?.entries ?? [])
    .filter((e) => e.playerPoolEntry?.player && e.lineupSlotId !== IR_SLOT)
    .map((e) => ({
      player: toEspnPlayer(e.playerPoolEntry!.player),
      points: weekPoints(e.playerPoolEntry!.player, Number(season), week),
      startedAt: e.lineupSlotId === BENCH_SLOT ? null : (SLOT_NAMES[e.lineupSlotId] ?? null),
    }));

  const game = schedule.schedule?.find((g) => g.matchupPeriodId === week && (g.home?.teamId === myTeamId || g.away?.teamId === myTeamId));
  const [mine, theirs] = game?.home?.teamId === myTeamId ? [game?.home, game?.away] : [game?.away, game?.home];

  // ESPN's free-agent list is today's: count those who were on no team that week.
  const taken = new Set((league.teams ?? []).flatMap((t) => (t.roster?.entries ?? []).map((e) => e.playerId)));
  const freeAgents: RosteredPlayer[] = freeAgentList.players
    .filter((fa) => !taken.has(fa.player.id))
    .map((fa) => ({ player: toEspnPlayer(fa.player), points: weekPoints(fa.player, Number(season), week), startedAt: null }))
    .filter((fa) => fa.points > 0);

  return recap(
    { platform: 'espn', leagueId, leagueName: league.settings?.name ?? `ESPN league ${leagueId}`, week },
    slots,
    rostered,
    mine?.totalPoints ?? null,
    theirs?.totalPoints ?? null,
    missedPickups(slots, rostered, freeAgents),
    "Based on ESPN's current free agents who were on no team that week; anyone picked up since isn't counted.",
  );
}

// Yahoo: your roster and points that week, and the best available players at each position, scored by Yahoo.
async function yahooRecaps(week: number, errors: SourceError[]): Promise<LineupRecap[]> {
  if (!(await yahooReady())) return [];
  const out: LineupRecap[] = [];
  for (const { team, league } of await myYahooTeams()) {
    try {
      const positions = [...startablePositions(league.slots)];
      const [roster, matchup, ...available] = await Promise.all([
        yahooGet(`team/${team.teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`),
        yahooGet(`team/${team.teamKey}/matchups;weeks=${week}`),
        ...positions.map((pos) =>
          yahooGet(`league/${league.leagueKey}/players;status=A;position=${pos};sort=PTS;sort_type=week;sort_week=${week};count=10/stats;type=week;week=${week}`),
        ),
      ]);
      const rostered: RosteredPlayer[] = parseRoster(roster)
        .filter((r) => r.slot !== 'IR')
        .map((r) => ({ player: r.player, points: r.points, startedAt: r.slot === 'BN' ? null : r.slot }));
      const freeAgents: RosteredPlayer[] = available
        .flatMap(parseLeaguePlayers)
        .filter((fa) => fa.points > 0)
        .map((fa) => ({ player: fa.player, points: fa.points, startedAt: null }));
      const game = parseMatchup(matchup, team.teamKey);
      out.push(
        recap(
          { platform: 'yahoo', leagueId: league.leagueKey, leagueName: league.name, week },
          league.slots,
          rostered,
          game?.me.points ?? null,
          game?.opponent?.points ?? null,
          missedPickups(league.slots, rostered, freeAgents),
          "Based on Yahoo's current free agents; anyone picked up since isn't counted.",
        ),
      );
    } catch (e) {
      errors.push({ source: `yahoo:${league.leagueKey}`, message: errorMessage(e) });
    }
  }
  return out;
}

// FFPC: only the week whose Live Scoring page was pasted, scored with FFPC's rules.
async function ffpcRecaps(season: string, week: number): Promise<LineupRecap[]> {
  const leagues = (await manualLeagueRepo.list()).filter((l) => l.matchup?.week === week);
  if (leagues.length === 0) return [];
  const [index, score] = await Promise.all([sleeperClient.players().then(buildPlayerIndex), liveScorer(season, week, FFPC_RULES)]);
  const resolve = (slot: string | null, name: string): Player | null => resolvePlayer({ slot, name }, index);

  return leagues.map((l) => {
    const snapshot = l.matchup!;
    const starters = snapshot.me.starters.map((s) => ({ s, player: resolve(s.slot, s.name) }));
    const startedNames = new Set(starters.flatMap(({ player }) => (player ? [player.playerId] : [])));
    const bench = parseRosterText(l.rosterText)
      .filter((line) => line.slot === 'BN')
      .flatMap((line) => resolve(line.slot, line.name) ?? [])
      .filter((p) => !startedNames.has(p.playerId));
    const slots = snapshot.me.starters.map((s) => s.slot);
    const rostered: RosteredPlayer[] = [
      ...starters.flatMap(({ s, player }) => (player ? [{ player, points: score(player).points, startedAt: s.slot }] : [])),
      ...bench.map((player) => ({ player, points: score(player).points, startedAt: null })),
    ];
    const opponent = snapshot.scoreboard?.length
      ? null // all-play week: there's no one opponent
      : snapshot.opponent.starters.reduce((sum, s) => sum + (resolve(s.slot, s.name) ? score(resolve(s.slot, s.name)!).points : s.points), 0);
    return recap({ platform: 'ffpc', leagueId: l.id, leagueName: l.teamName || l.name, week }, slots, rostered, null, opponent, null, "FFPC has no record of who was available in past weeks.");
  });
}

/** Weeks whose games are all over, newest first. */
async function finishedWeeks(season: string, current: number): Promise<number[]> {
  const games = await nflGames(season, current).catch(() => null);
  const currentDone = games != null && games.size > 0 && [...games.values()].every((g) => g.progress >= 1);
  const last = currentDone ? current : current - 1;
  return Array.from({ length: Math.max(0, last) }, (_, i) => last - i);
}

export async function getRecap(requested?: number): Promise<RecapResponse> {
  const state = await sleeperClient.state();
  const weeks = await finishedWeeks(state.season, state.week);
  const week = requested && weeks.includes(requested) ? requested : (weeks[0] ?? 0);
  if (!week) return { season: state.season, week: 0, weeks, leagues: [], errors: [] };

  const errors: SourceError[] = [];
  const settle = <T,>(source: string, p: Promise<T[]>) =>
    p.catch((e) => {
      errors.push({ source, message: errorMessage(e) });
      return [] as T[];
    });
  const results = await Promise.all([
    settle('sleeper', sleeperRecaps(state.season, week)),
    settle('espn', espnRecaps(state.season, week, config.espnAuth, errors)),
    settle('yahoo', yahooRecaps(week, errors)),
    settle('ffpc', ffpcRecaps(state.season, week)),
  ]);
  return { season: state.season, week, weeks, leagues: results.flat(), errors };
}

// A finished week's recap barely changes (an FFPC paste is the exception), so
// the season view reuses each week's for a while instead of rebuilding them all.
const weekRecap = (season: string, week: number) => cached(`recap:week:${season}:${week}`, 30 * MINUTE, () => getRecap(week));

/** Every finished week's recap, boiled down per league. Weeks load one at a time to go easy on the platforms. */
export async function getRecapSeason(): Promise<RecapSeasonResponse> {
  const state = await sleeperClient.state();
  const weeks = await finishedWeeks(state.season, state.week);
  const byLeague = new Map<string, RecapSeasonLeague>();
  const errors = new Map<string, SourceError>();
  for (const week of [...weeks].reverse()) {
    const r = await weekRecap(state.season, week);
    for (const e of r.errors) errors.set(e.source, e);
    for (const l of r.leagues) {
      const key = `${l.platform}:${l.leagueId}`;
      const entry = byLeague.get(key) ?? { platform: l.platform, leagueId: l.leagueId, weeks: [], winnable: [], leftOnBench: 0 };
      entry.weeks.push(l.week);
      if (l.bestWouldWin) entry.winnable.push(l.week);
      entry.leftOnBench = round1(entry.leftOnBench + l.leftOnBench);
      byLeague.set(key, entry);
    }
  }
  return { season: state.season, leagues: [...byLeague.values()], errors: [...errors.values()] };
}
