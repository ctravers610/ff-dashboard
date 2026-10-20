// GET /api/outlook: for each league, your chance of making the playoffs (the
// rest of the regular season simulated from everyone's scoring so far) and a
// preview of your next opponent. Sleeper and ESPN only: FFPC has no standings
// or schedule we can see.

import type { LeagueOutlook, OpponentPreview, OutlookResponse, SourceError } from '@ffd/shared';
import { espnClient, type EspnAuth } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, teamName as espnTeamName, toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnLeague } from '../adapters/espn/types.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperLeague } from '../adapters/sleeper/types.js';
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
}

/** The outlook for your team from a loaded season. `previewWeek`: the first week whose games haven't started. */
export function outlookFor(base: Pick<LeagueOutlook, 'platform' | 'leagueId'>, s: LoadedSeason, previewWeek: number): LeagueOutlook {
  const odds = s.remaining.length ? simulate(s).get(s.myTeamId) : null;
  const me = s.teams.find((t) => t.teamId === s.myTeamId);
  const decided = s.remaining.length === 0 && me && s.playoffTeams;
  const finalRank = [...s.teams].sort(standingsOrder).findIndex((t) => t.teamId === s.myTeamId) + 1;

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
  return {
    teams,
    remaining,
    playoffTeams: league.settings?.playoff_teams ?? null,
    medianGames: league.settings?.league_average_match === 1,
    myTeamId: String(mine.roster_id),
    injured,
  };
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
  return { teams, remaining, playoffTeams: league.settings?.scheduleSettings?.playoffTeamCount ?? null, myTeamId: String(myTeamId), injured };
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
