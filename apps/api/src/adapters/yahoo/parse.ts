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

/** Your teams this NFL season, from users;use_login=1/games;game_codes=nfl/teams. */
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
}

/** Your leagues, from users;use_login=1/games;game_codes=nfl/leagues. */
export function parseLeagues(json: Json): YahooLeagueInfo[] {
  return userGames(json).flatMap((game) =>
    items(flat(game).leagues, 'league').map((l) => {
      const p = flat(l);
      return { leagueKey: str(p.league_key), leagueId: str(p.league_id), name: str(p.name), season: str(p.season), currentWeek: num(p.current_week) };
    }),
  );
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

/** This week's matchup: your side and, as totals only, your opponent's. */
export function parseMatchup(json: Json, myTeamKey: string): { me: YahooSide; opponent: YahooSide | null } | null {
  const matchup = items(flat(teamResource(json)).matchups, 'matchup')[0];
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
  return { me, opponent: sides.find((s) => s.teamKey !== myTeamKey) ?? null };
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

/** Your roster for the week, with each player's slot and points (team/{key}/roster;week=N/players/stats). */
export function parseRoster(json: Json): YahooRosterSpot[] {
  const roster = flat(teamResource(json)).roster;
  const players = isObject(roster) ? items(flat(roster['0']).players, 'player') : [];
  return players.map((raw) => {
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
  });
}

/** Your record and rank (team/{key}/standings). */
export function parseStandings(json: Json): Pick<TeamStanding, 'wins' | 'losses' | 'ties' | 'rank' | 'pointsFor' | 'pointsAgainst'> | null {
  const s = flat(teamResource(json)).team_standings;
  if (!isObject(s)) return null;
  const totals = isObject(s.outcome_totals) ? s.outcome_totals : {};
  return { wins: num(totals.wins), losses: num(totals.losses), ties: num(totals.ties), rank: num(s.rank), pointsFor: num(s.points_for), pointsAgainst: num(s.points_against) };
}

/**
 * One Yahoo league as the dashboard shows it: your team only. The opponent
 * appears as a name and a score, never a roster, and the standings hold just
 * your own line (the agreement covers your own leagues and teams).
 */
export function toYahooSummary(
  league: YahooLeagueInfo,
  team: YahooTeamRef,
  roster: YahooRosterSpot[],
  matchup: ReturnType<typeof parseMatchup>,
  record: ReturnType<typeof parseStandings>,
  week: number,
): LeagueSummary {
  const starters: StarterSlot[] = roster.filter((r) => !NOT_STARTING.has(r.slot)).map((r) => ({ slot: r.slot, player: r.player, points: r.points }));
  const rosterEntries: RosterEntry[] = roster.map((r) => ({ player: r.player, status: r.slot === 'IR' ? 'ir' : r.slot === 'BN' ? 'bench' : 'starter' }));
  const standings: TeamStanding[] = record
    ? [{ teamId: team.teamKey, teamName: team.teamName, ownerName: 'You', avatarUrl: null, ...record }]
    : [];
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
            ? { teamId: matchup.opponent.teamKey, teamName: matchup.opponent.teamName, points: matchup.opponent.points, projected: matchup.opponent.projected, starters: [] }
            : null,
        }
      : null,
    alerts: buildAlerts(starters),
    roster: rosterEntries,
  };
}
