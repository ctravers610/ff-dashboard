// Turns Yahoo Fantasy API responses (?format=json) into the dashboard's shapes.
// Yahoo's JSON is XML translated literally: a resource is an array of one-key
// objects (plus nested sub-resources), and a collection is an object keyed
// "0", "1", ... with a "count". Pure functions, tested on made-up responses.

import type { InjuryStatus, LeagueSummary, Player, RosterEntry, StarterSlot, TeamStanding } from '@ffd/shared';
import { buildAlerts } from '../common.js';

type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Merges a Yahoo array of one-key objects (skipping nested arrays and empty items) into one object. */
export function flat(resource: Json): Record<string, Json> {
  const out: Record<string, Json> = {};
  const visit = (v: Json) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (isObject(v)) Object.assign(out, v);
  };
  visit(resource);
  return out;
}

/** The items of a Yahoo collection: { "0": { team: x }, "1": { team: y }, count: 2 } -> [x, y]. */
export function items(collection: Json, key: string): Json[] {
  if (!isObject(collection)) return [];
  return Object.entries(collection)
    .filter(([k]) => /^\d+$/.test(k))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => (isObject(v) ? v[key] : undefined))
    .filter((v) => v !== undefined);
}

const num = (v: Json): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0);
const str = (v: Json): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** The games (each an array: game properties, then sub-resources) under users;use_login=1. */
function userGames(json: Json): Json[] {
  const content = isObject(json) ? json.fantasy_content : null;
  const user = items(isObject(content) ? content.users : null, 'user')[0];
  return items(flat(user).games, 'game');
}

/** The league key a team key belongs to: "461.l.777001.t.4" -> "461.l.777001". */
export const leagueOf = (teamKey: string) => teamKey.replace(/\.t\.\d+$/, '');

export interface YahooTeamRef {
  teamKey: string;
  teamName: string;
  leagueKey: string;
}

/** Your teams this NFL season, from users;use_login=1/games;game_keys=nfl/teams. */
export function parseMyTeams(json: Json): YahooTeamRef[] {
  return userGames(json).flatMap((game) =>
    items(flat(game).teams, 'team').map((t) => {
      const p = flat(t);
      return { teamKey: str(p.team_key), teamName: str(p.name), leagueKey: leagueOf(str(p.team_key)) };
    }),
  );
}

export interface YahooLeagueInfo {
  leagueKey: string;
  leagueId: string;
  name: string;
  season: string;
  currentWeek: number;
  slots: string[]; // lineup slots in order, one per starter: QB, WR, WR, ... (empty if settings weren't returned)
  previousKey: string | null; // the same league last season, when it was renewed from one
}

/** The league's starting slots, from its settings' roster_positions (a list, or a collection). */
function lineupSlots(settings: Json): string[] {
  const positions = flat(settings).roster_positions;
  const list = Array.isArray(positions) ? positions.map((p) => (isObject(p) ? p.roster_position : undefined)) : items(positions, 'roster_position');
  return list.flatMap((p) => {
    const r = flat(p);
    const position = str(r.position);
    return position && !NOT_STARTING.has(position) ? Array<string>(num(r.count)).fill(position) : [];
  });
}

/** Your leagues, from users;use_login=1/games;game_keys=nfl/leagues;out=settings. */
export function parseLeagues(json: Json): YahooLeagueInfo[] {
  return userGames(json).flatMap((game) =>
    items(flat(game).leagues, 'league').map((l) => {
      const p = flat(l);
      return {
        leagueKey: str(p.league_key),
        leagueId: str(p.league_id),
        name: str(p.name),
        season: str(p.season),
        currentWeek: num(p.current_week),
        slots: lineupSlots(p.settings),
        // Yahoo writes the league it was renewed from as "461_906193".
        previousKey: str(p.renew).replace('_', '.l.') || null,
      };
    }),
  );
}

export interface YahooGameWeek {
  week: number;
  start: string; // YYYY-MM-DD, the Tuesday (or opening Thursday) it starts
  end: string; // YYYY-MM-DD, the Monday it ends
}

/** A season's fantasy weeks and their dates (game/{game_key}/game_weeks). */
export function parseGameWeeks(json: Json): YahooGameWeek[] {
  const content = isObject(json) ? json.fantasy_content : null;
  return items(flat(isObject(content) ? content.game : null).game_weeks, 'game_week').map((w) => {
    const p = flat(w);
    return { week: num(p.week), start: str(p.start), end: str(p.end) };
  });
}

/** The fantasy week a moment falls in, by its Eastern date; null outside the season's weeks. */
export function weekOn(weeks: YahooGameWeek[], at: Date): number | null {
  const day = at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  return weeks.find((w) => w.start <= day && day <= w.end)?.week ?? null;
}

/** The team resource inside a single-team response (team/{key}/...). */
const teamResource = (json: Json): Json[] => {
  const content = isObject(json) ? json.fantasy_content : null;
  const t = isObject(content) ? content.team : null;
  return Array.isArray(t) ? t : [];
};

export interface YahooSide {
  teamKey: string;
  teamName: string;
  points: number;
  projected: number | null;
}

export interface YahooMatchup {
  week: number;
  status: string; // preevent, midevent, postevent
  me: YahooSide;
  opponent: YahooSide | null;
}

function toMatchup(matchup: Json, myTeamKey: string): YahooMatchup | null {
  if (!isObject(matchup)) return null;
  // A matchup's own fields sit on it directly; its teams under a "0" key.
  const inner = isObject(matchup['0']) ? matchup['0'] : matchup;
  const sides = items(inner.teams, 'team').map((t): YahooSide => {
    const p = flat(t);
    const projected = isObject(p.team_projected_points) ? num(p.team_projected_points.total) : null;
    return { teamKey: str(p.team_key), teamName: str(p.name), points: isObject(p.team_points) ? num(p.team_points.total) : 0, projected };
  });
  const me = sides.find((s) => s.teamKey === myTeamKey);
  if (!me) return null;
  return { week: num(matchup.week), status: str(matchup.status), me, opponent: sides.find((s) => s.teamKey !== myTeamKey) ?? null };
}

/** Every matchup in a team/{key}/matchups response, in week order. */
export function parseMatchups(json: Json, myTeamKey: string): YahooMatchup[] {
  return items(flat(teamResource(json)).matchups, 'matchup').flatMap((m) => toMatchup(m, myTeamKey) ?? []);
}

/** This week's matchup totals (team/{key}/matchups;weeks=N): your side and your opponent's. */
export function parseMatchup(json: Json, myTeamKey: string): YahooMatchup | null {
  return parseMatchups(json, myTeamKey)[0] ?? null;
}

// Yahoo's status codes for NFL players.
const INJURY: Record<string, InjuryStatus> = { Q: 'Questionable', D: 'Doubtful', O: 'Out', IR: 'IR', 'IR-R': 'IR', 'PUP-P': 'PUP', 'PUP-R': 'PUP', SUSP: 'Suspended', NFI: 'Out', 'NFI-R': 'Out', NA: 'Out' };
const TEAM: Record<string, string> = { WSH: 'WAS' };
const NOT_STARTING = new Set(['BN', 'IR']);

export interface YahooRosterSpot {
  player: Player;
  slot: string; // Yahoo's selected position: QB, W/R/T, BN, IR, ...
  points: number;
}

/** A team's roster for the week, with each player's slot and points (team/{key}/roster;week=N/players/stats). */
export const parseRoster = (json: Json): YahooRosterSpot[] => rosterSpots(flat(teamResource(json)).roster);

/** The players in a roster resource, with each one's slot and points. */
function rosterSpots(roster: Json): YahooRosterSpot[] {
  return (isObject(roster) ? items(flat(roster['0']).players, 'player') : []).map(playerSpot);
}

/**
 * A league's players with their points, e.g. who's available, scored for a week
 * (league/{key}/players;status=A;.../stats;type=week;week=N). The slot is empty.
 */
export const parseLeaguePlayers = (json: Json): YahooRosterSpot[] => items(leagueResource(json).players, 'player').map(playerSpot);

function playerSpot(raw: Json): YahooRosterSpot {
  const p = flat(raw);
  const team = str(p.editorial_team_abbr).toUpperCase();
  const selected = flat(p.selected_position);
  const name = isObject(p.name) ? str(p.name.full) : '';
  return {
    player: {
      playerId: `yahoo:${str(p.player_id)}`,
      name,
      position: str(p.display_position).split(',')[0]!,
      nflTeam: team ? (TEAM[team] ?? team) : null,
      injuryStatus: INJURY[str(p.status)] ?? null,
    },
    slot: str(selected.position),
    points: isObject(p.player_points) ? num(p.player_points.total) : 0,
  };
}

/** A Yahoo list that may come as an array of one-key objects or as a collection. */
const listOf = (v: Json, key: string): Json[] =>
  Array.isArray(v) ? v.map((x) => (isObject(x) ? x[key] : undefined)).filter((x) => x !== undefined) : items(v, key);

/** The league resource's merged properties and sub-resources (league/{key}/...). */
const leagueResource = (json: Json): Record<string, Json> => {
  const content = isObject(json) ? json.fantasy_content : null;
  return flat(isObject(content) ? content.league : null);
};

/** The league's playoff and waiver setup (league/{key};out=settings). */
export function parseLeagueSettings(json: Json): {
  playoffTeams: number | null;
  playoffStartWeek: number | null;
  usesFaab: boolean;
  rosterSize: number; // every roster spot but IR
} {
  const s = flat(leagueResource(json).settings);
  const positions = Array.isArray(s.roster_positions) ? s.roster_positions.map((p) => (isObject(p) ? p.roster_position : undefined)) : items(s.roster_positions, 'roster_position');
  const rosterSize = positions.reduce((n: number, p) => {
    const r = flat(p);
    return str(r.position) === 'IR' ? n : n + num(r.count);
  }, 0);
  return { playoffTeams: num(s.num_playoff_teams) || null, playoffStartWeek: num(s.playoff_start_week) || null, usesFaab: str(s.uses_faab) === '1', rosterSize };
}

/** Each team's waiver standing, by team key (league/{key}/teams). */
export function parseWaiverStanding(json: Json): Map<string, { priority: number | null; faabBalance: number | null }> {
  return new Map(
    items(leagueResource(json).teams, 'team').map((t) => {
      const p = flat(t);
      return [str(p.team_key), { priority: num(p.waiver_priority) || null, faabBalance: p.faab_balance == null ? null : num(p.faab_balance) }];
    }),
  );
}

export interface YahooAdd {
  at: Date; // when it processed
  fromWaivers: boolean; // a claim, rather than a free-agent pickup
  bid: number | null; // FAAB leagues' winning bid
  player: Player | null;
  teamKey: string; // the team that added him
}

/** Every player added, with when and how (league/{key}/transactions;types=add). Drops and trades are left out. */
export function parseAdds(json: Json): YahooAdd[] {
  return items(leagueResource(json).transactions, 'transaction').flatMap((t): YahooAdd[] => {
    const p = flat(t);
    if (str(p.status) !== 'successful') return [];
    return items(p.players, 'player').flatMap((raw) => {
      const data = flat(flat(raw).transaction_data); // an object, or an array of one
      if (str(data.type) !== 'add') return [];
      return [{
        at: new Date(num(p.timestamp) * 1000),
        fromWaivers: str(data.source_type) === 'waivers',
        bid: p.faab_bid == null ? null : num(p.faab_bid),
        player: playerSpot(raw).player,
        teamKey: str(data.destination_team_key),
      }];
    });
  });
}

/** Available players and whether each is on waivers or a free agent (league/{key}/players;status=A;out=ownership). */
export function parseAvailable(json: Json): (YahooRosterSpot & { onWaivers: boolean | null })[] {
  return items(leagueResource(json).players, 'player').map((raw) => {
    const ownership = flat(flat(raw).ownership);
    const type = str(ownership.ownership_type);
    return { ...playerSpot(raw), onWaivers: type === 'waivers' ? true : type === 'freeagents' ? false : null };
  });
}

/** Every team's season schedule and scores, by team key (league/{key}/teams/matchups). */
export function parseLeagueSchedule(json: Json): Map<string, YahooMatchup[]> {
  return new Map(
    items(leagueResource(json).teams, 'team').map((t) => {
      const p = flat(t);
      const teamKey = str(p.team_key);
      return [teamKey, items(p.matchups, 'matchup').flatMap((m) => toMatchup(m, teamKey) ?? [])];
    }),
  );
}

/** Every team's roster this week, by team key (league/{key}/teams/roster). */
export function parseLeagueRosters(json: Json): Map<string, YahooRosterSpot[]> {
  return new Map(
    items(leagueResource(json).teams, 'team').map((t) => {
      const p = flat(t);
      return [str(p.team_key), rosterSpots(p.roster)];
    }),
  );
}

/** Every team's record and rank, best first (league/{key}/standings). */
export function parseStandings(json: Json): TeamStanding[] {
  return items(flat(leagueResource(json).standings).teams, 'team')
    .flatMap((t): TeamStanding[] => {
      const p = flat(t);
      const s = p.team_standings;
      if (!isObject(s)) return [];
      const totals = isObject(s.outcome_totals) ? s.outcome_totals : {};
      const manager = flat(listOf(p.managers, 'manager')[0]);
      const logo = flat(listOf(p.team_logos, 'team_logo')[0]);
      return [{
        teamId: str(p.team_key),
        teamName: str(p.name),
        ownerName: str(manager.nickname),
        avatarUrl: str(logo.url) || null,
        wins: num(totals.wins),
        losses: num(totals.losses),
        ties: num(totals.ties),
        rank: num(s.rank),
        pointsFor: num(s.points_for),
        pointsAgainst: num(s.points_against),
      }];
    })
    .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
}

/**
 * A team's starters laid out on the league's slots. Yahoo lists only filled
 * slots, so a slot nobody fills becomes an empty one (and a lineup alert).
 */
export function startersOf(roster: YahooRosterSpot[], slots: string[]): StarterSlot[] {
  const filled = roster.filter((r) => !NOT_STARTING.has(r.slot)).map((r): StarterSlot => ({ slot: r.slot, player: r.player, points: r.points }));
  const laidOut = slots.map((slot): StarterSlot => {
    const i = filled.findIndex((s) => s.slot === slot);
    return i === -1 ? { slot, player: null, points: 0 } : filled.splice(i, 1)[0]!;
  });
  return [...laidOut, ...filled]; // anything in a slot the settings didn't list goes last
}

/**
 * One Yahoo league as the dashboard shows it: your team, this week's
 * opponent's starting lineup, and the league's standings.
 */
export function toYahooSummary(
  league: YahooLeagueInfo,
  team: YahooTeamRef,
  roster: YahooRosterSpot[],
  matchup: ReturnType<typeof parseMatchup>,
  standings: TeamStanding[],
  week: number,
  opponentRoster: YahooRosterSpot[] = [],
): LeagueSummary {
  const starters = startersOf(roster, league.slots);
  const rosterEntries: RosterEntry[] = roster.map((r) => ({ player: r.player, status: r.slot === 'IR' ? 'ir' : r.slot === 'BN' ? 'bench' : 'starter' }));
  return {
    leagueId: league.leagueKey,
    platform: 'yahoo',
    account: 'Yahoo',
    name: league.name,
    season: league.season,
    week,
    myTeamId: team.teamKey,
    standings,
    matchup: matchup
      ? {
          week,
          me: { teamId: team.teamKey, teamName: matchup.me.teamName || team.teamName, points: matchup.me.points, projected: matchup.me.projected, starters },
          opponent: matchup.opponent
            ? { teamId: matchup.opponent.teamKey, teamName: matchup.opponent.teamName, points: matchup.opponent.points, projected: matchup.opponent.projected, starters: opponentRoster.length ? startersOf(opponentRoster, league.slots) : [] }
            : null,
        }
      : null,
    alerts: buildAlerts(starters),
    roster: rosterEntries,
  };
}
