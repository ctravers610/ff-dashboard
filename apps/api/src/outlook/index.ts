// GET /api/outlook: for each league, your chance of making the playoffs (the
// rest of the regular season simulated from everyone's scoring so far), a
// preview of your next opponent, how lucky every team has been, and the
// season's awards. Sleeper and ESPN only: FFPC has no standings or schedule
// we can see.

import type { LeagueOutlook, OpponentPreview, OutlookResponse, SourceError } from '@ffd/shared';
import { espnClient, type EspnAuth } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, teamName as espnTeamName, toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnLeague } from '../adapters/espn/types.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperLeague, SleeperMatchup, SleeperTransaction } from '../adapters/sleeper/types.js';
import { lineupTotals, type RosteredPlayer } from '../recap/lineup.js';
import { getTrades } from '../trades/index.js';
import { luckTable, seasonAwards, type AwardExtras, type PlayedGame } from './digest.js';
import { config } from '../config.js';
import { nflGames } from '../scoring/games.js';
import { activeSources } from '../sources/store.js';
import { headToHead, simulate, standingsOrder, strengths, type Game, type LeagueSeason, type SeasonTeam } from './model.js';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const round1 = (n: number) => Math.round(n * 10) / 10;
const record = (t: SeasonTeam) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`;

/** A league's season, plus what the preview needs: your team, and each team's sidelined starters. */
interface LoadedSeason extends LeagueSeason {
  myTeamId: string;
  injured: Map<string, OpponentPreview['injuredStarters']>;
  played: PlayedGame[]; // finished head-to-head games, for luck and awards
  extras?: AwardExtras;
}

/** The outlook for your team from a loaded season. `previewWeek`: the first week whose games haven't started. */
export function outlookFor(base: Pick<LeagueOutlook, 'platform' | 'leagueId'>, s: LoadedSeason, previewWeek: number): LeagueOutlook {
  const odds = s.remaining.length ? simulate(s).get(s.myTeamId) : null;
  const me = s.teams.find((t) => t.teamId === s.myTeamId);
  const decided = s.remaining.length === 0 && me && s.playoffTeams;
  const finalRank = [...s.teams].sort(standingsOrder).findIndex((t) => t.teamId === s.myTeamId) + 1;
  const luck = luckTable(s.teams, s.played, s.myTeamId);

  let next: OpponentPreview | null = null;
  const game = s.remaining.find((g) => g.week >= previewWeek && (g.a === s.myTeamId || g.b === s.myTeamId));
  const them = game && s.teams.find((t) => t.teamId === (game.a === s.myTeamId ? game.b : game.a));
  if (game && them && me) {
    const strength = strengths(s.teams);
    const games = them.wins + them.losses + them.ties;
    next = {
      week: game.week,
      teamName: them.name,
      record: record(them),
      rank: [...s.teams].sort(standingsOrder).findIndex((t) => t.teamId === them.teamId) + 1,
      avgPoints: games ? round1(them.pointsFor / games) : null,
      recent: them.results.slice(-3),
      winChance: headToHead(strength.get(me.teamId)!, strength.get(them.teamId)!),
      injuredStarters: s.injured.get(them.teamId) ?? [],
    };
  }
  return {
    ...base,
    playoffTeams: s.playoffTeams,
    teams: s.teams.length,
    playoffChance: odds ? odds.playoffChance : decided ? (finalRank <= s.playoffTeams! ? 1 : 0) : null,
    projectedWins: odds ? round1(odds.projectedWins) : (me?.wins ?? null),
    next,
    luck,
    awards: seasonAwards(s.teams, s.played, luck, s.myTeamId, s.extras),
  };
}

// ── Sleeper ─────────────────────────────────────────────────────────────

async function sleeperSeason(league: SleeperLeague, myUserId: string, players: Awaited<ReturnType<typeof sleeperClient.players>>, currentWeek: number): Promise<LoadedSeason | null> {
  const [users, rosters] = await Promise.all([sleeperClient.leagueUsers(league.league_id), sleeperClient.rosters(league.league_id)]);
  const mine = rosters.find((r) => r.owner_id === myUserId || r.co_owners?.includes(myUserId));
  if (!mine) return null;
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teams: SeasonTeam[] = rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const s = r.settings;
    return {
      teamId: String(r.roster_id),
      name: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pointsFor: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      // Sleeper keeps each team's results as a string, e.g. "WWLWL".
      results: [...(r.metadata?.record ?? '')].filter((c): c is 'W' | 'L' | 'T' => 'WLT'.includes(c)),
    };
  });

  // The regular season ends the week before the playoffs. Sleeper's standings
  // count weeks that are over, so this week on is still to play. (Counting
  // games played instead would be wrong in median leagues: two results a week.)
  const lastWeek = (league.settings?.playoff_week_start ?? 15) - 1;
  const weeks = Array.from({ length: Math.max(0, lastWeek - currentWeek + 1) }, (_, i) => currentWeek + i);
  const remaining: Game[] = (
    await Promise.all(
      weeks.map(async (week) => {
        const byMatchup = new Map<number, string[]>();
        for (const m of await sleeperClient.matchups(league.league_id, week)) {
          if (m.matchup_id == null) continue;
          byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), String(m.roster_id)]);
        }
        return [...byMatchup.values()].flatMap(([a, b]) => (a && b ? [{ week, a, b }] : []));
      }),
    )
  ).flat();

  // Starters each team has in its lineup right now who are hurt.
  const injured = new Map(
    rosters.map((r) => [
      String(r.roster_id),
      (r.starters ?? []).flatMap((id) => {
        const p = toPlayer(id, players);
        return p?.injuryStatus ? [{ name: p.name, position: p.position, status: p.injuryStatus }] : [];
      }),
    ]),
  );
  // Finished weeks: every game's score, and what Sleeper alone can tell (benches, pickups, trades).
  const finished = Array.from({ length: Math.max(0, Math.min(currentWeek - 1, lastWeek)) }, (_, i) => i + 1);
  const pastWeeks = await Promise.all(finished.map(async (week) => [week, await sleeperClient.matchups(league.league_id, week)] as const));
  const played: PlayedGame[] = pastWeeks.flatMap(([week, matchups]) => {
    const byMatchup = new Map<number, SleeperMatchup[]>();
    for (const m of matchups) if (m.matchup_id != null) byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m]);
    return [...byMatchup.values()].flatMap(([a, b]) => (a && b ? [{ week, a: String(a.roster_id), b: String(b.roster_id), pa: a.points, pb: b.points }] : []));
  });
  const extras = await sleeperExtras(league, pastWeeks, players, rosters.map((r) => String(r.roster_id)));

  return {
    teams,
    remaining,
    playoffTeams: league.settings?.playoff_teams ?? null,
    medianGames: league.settings?.league_average_match === 1,
    myTeamId: String(mine.roster_id),
    injured,
    played,
    extras,
  };
}

/** Benches, the best waiver pickup and the worst trade: Sleeper's matchups and transactions have the detail. */
async function sleeperExtras(
  league: SleeperLeague,
  pastWeeks: (readonly [number, SleeperMatchup[]])[],
  players: Awaited<ReturnType<typeof sleeperClient.players>>,
  teamIds: string[],
): Promise<AwardExtras> {
  const slots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));
  const benchLeft = new Map(teamIds.map((id) => [id, 0]));
  for (const [, matchups] of pastWeeks) {
    for (const m of matchups) {
      if (!m.players_points) continue;
      const startedAt = new Map((m.starters ?? []).map((id, i) => [id, slots[i] ?? null]));
      const rostered: RosteredPlayer[] = (m.players ?? []).flatMap((id) => {
        const player = toPlayer(id, players);
        return player ? [{ player, points: m.players_points![id] ?? 0, startedAt: startedAt.get(id) ?? null }] : [];
      });
      const totals = lineupTotals(slots, rostered);
      benchLeft.set(String(m.roster_id), (benchLeft.get(String(m.roster_id)) ?? 0) + Math.max(0, totals.best - (m.points ?? totals.points)));
    }
  }

  // The pickup whose new team got the most started points out of him after the claim.
  const claims = (
    await Promise.all(pastWeeks.map(([week]) => sleeperClient.transactions(league.league_id, week).catch(() => [] as SleeperTransaction[])))
  )
    .flat()
    .filter((t) => (t.type === 'waiver' || t.type === 'free_agent') && t.status === 'complete');
  let bestPickup: AwardExtras['bestPickup'] = null;
  for (const t of claims) {
    for (const [id, roster] of Object.entries(t.adds ?? {})) {
      const points = pastWeeks
        .filter(([week]) => week > (t.leg ?? 0))
        .reduce((n, [, ms]) => {
          const m = ms.find((x) => x.roster_id === roster);
          return n + (m?.starters?.includes(id) ? (m.players_points?.[id] ?? 0) : 0);
        }, 0);
      const name = toPlayer(id, players)?.name;
      if (name && points > (bestPickup?.points ?? 0)) bestPickup = { teamId: String(roster), player: name, points: round1(points) };
    }
  }

  const trades = await getTrades(`sleeper:${league.league_id}`).catch(() => null);
  const worst = [...(trades?.trades ?? [])].sort((a, b) => b.margin - a.margin)[0];
  const worstTrade =
    worst && worst.margin >= 10 ? { loser: worst.sides[1]!.teamName, winner: worst.sides[0]!.teamName, margin: worst.margin, wins: worst.winsSwung } : null;
  return { benchLeft: new Map([...benchLeft].map(([id, n]) => [id, round1(n)])), bestPickup, worstTrade };
}

// ── ESPN ────────────────────────────────────────────────────────────────

export function espnSeason(league: EspnLeague, myTeamId: number): LoadedSeason {
  const schedule = league.schedule ?? [];
  const lastPeriod = league.settings?.scheduleSettings?.matchupPeriodCount ?? Math.max(0, ...schedule.map((g) => g.matchupPeriodId));
  // A game is over once ESPN names a winner.
  const finished = (g: (typeof schedule)[number]) => g.winner != null && g.winner !== 'UNDECIDED';
  const results = new Map<string, ('W' | 'L' | 'T')[]>();
  for (const g of [...schedule].filter(finished).sort((x, y) => x.matchupPeriodId - y.matchupPeriodId)) {
    for (const [side, other] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      if (!side) continue;
      const won = g.winner === 'TIE' ? 'T' : (g.winner === 'HOME') === (side === g.home) ? 'W' : 'L';
      results.set(String(side.teamId), [...(results.get(String(side.teamId)) ?? []), other ? won : 'W']);
    }
  }
  const teams: SeasonTeam[] = (league.teams ?? []).map((t) => {
    const r = t.record?.overall;
    return {
      teamId: String(t.id),
      name: espnTeamName(t),
      wins: r?.wins ?? 0,
      losses: r?.losses ?? 0,
      ties: r?.ties ?? 0,
      pointsFor: r?.pointsFor ?? 0,
      results: results.get(String(t.id)) ?? [],
    };
  });
  const remaining: Game[] = schedule
    .filter((g) => !finished(g) && g.matchupPeriodId <= lastPeriod && g.home && g.away)
    .map((g) => ({ week: g.matchupPeriodId, a: String(g.home!.teamId), b: String(g.away!.teamId) }));
  const injured = new Map(
    (league.teams ?? []).map((t) => [
      String(t.id),
      (t.roster?.entries ?? []).flatMap((e) => {
        if (e.lineupSlotId === BENCH_SLOT || e.lineupSlotId === IR_SLOT || !e.playerPoolEntry?.player) return [];
        const p = toEspnPlayer(e.playerPoolEntry.player);
        return p.injuryStatus ? [{ name: p.name, position: p.position, status: p.injuryStatus }] : [];
      }),
    ]),
  );
  const played: PlayedGame[] = schedule
    .filter((g) => finished(g) && g.matchupPeriodId <= lastPeriod && g.home && g.away)
    .map((g) => ({ week: g.matchupPeriodId, a: String(g.home!.teamId), b: String(g.away!.teamId), pa: g.home!.totalPoints ?? 0, pb: g.away!.totalPoints ?? 0 }));
  return { teams, remaining, playoffTeams: league.settings?.scheduleSettings?.playoffTeamCount ?? null, myTeamId: String(myTeamId), injured, played };
}

async function espnOutlooks(leagueIds: string[], season: string, auth: EspnAuth | null, previewWeek: number, errors: SourceError[]): Promise<LeagueOutlook[]> {
  if (!auth) return [];
  const out: LeagueOutlook[] = [];
  for (const leagueId of leagueIds) {
    try {
      const league = await espnClient.league(leagueId, season, auth);
      const myTeamId = findMyTeamId(league, auth.swid);
      if (myTeamId == null) continue;
      out.push(outlookFor({ platform: 'espn', leagueId }, espnSeason(league, myTeamId), previewWeek));
    } catch (e) {
      errors.push({ source: `espn:${leagueId}`, message: errorMessage(e) });
    }
  }
  return out;
}

async function sleeperOutlooks(usernames: string[], season: string, currentWeek: number, previewWeek: number): Promise<LeagueOutlook[]> {
  const players = await sleeperClient.players();
  const out: LeagueOutlook[] = [];
  const seen = new Set<string>();
  for (const username of usernames) {
    const user = await sleeperClient.user(username);
    if (!user?.user_id) continue;
    for (const league of await sleeperClient.leagues(user.user_id, season)) {
      if (seen.has(league.league_id)) continue;
      seen.add(league.league_id);
      const s = await sleeperSeason(league, user.user_id, players, currentWeek);
      if (s) out.push(outlookFor({ platform: 'sleeper', leagueId: league.league_id }, s, previewWeek));
    }
  }
  return out;
}

export async function getOutlook(): Promise<OutlookResponse> {
  const state = await sleeperClient.state();
  // Preview the first week whose games haven't started: this week until kickoff, then next week.
  const games = await nflGames(state.season, state.week).catch(() => null);
  const previewWeek = games && [...games.values()].some((g) => g.started) ? state.week + 1 : state.week;

  const sources = await activeSources();
  const errors: SourceError[] = [];
  const settle = (source: string, p: Promise<LeagueOutlook[]>) =>
    p.catch((e) => {
      errors.push({ source, message: errorMessage(e) });
      return [] as LeagueOutlook[];
    });
  const results = await Promise.all([
    settle('sleeper', sleeperOutlooks(sources.sleeperUsernames, state.season, state.week, previewWeek)),
    settle('espn', espnOutlooks(sources.espnLeagueIds, state.season, config.espnAuth, previewWeek, errors)),
  ]);
  return { season: state.season, leagues: results.flat(), errors };
}
