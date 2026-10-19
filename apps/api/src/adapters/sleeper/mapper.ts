// Pure functions that turn raw Sleeper payloads into the shared data model.
// No network calls here, which keeps this file easy to unit test.

import type {
  InjuryStatus,
  LeagueSummary,
  MatchupSide,
  Player,
  StarterSlot,
  TeamStanding,
} from '@ffd/shared';
import { buildAlerts, rankStandings } from '../common.js';
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperUser,
} from './types.js';

export interface SleeperLeagueData {
  account: string;
  myUserId: string;
  week: number;
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  players: SleeperPlayerMap;
}

const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI']);
const EMPTY_SLOT_ID = '0';

const INJURY_MAP: Record<string, InjuryStatus> = {
  Questionable: 'Questionable',
  Doubtful: 'Doubtful',
  Out: 'Out',
  IR: 'IR',
  PUP: 'PUP',
  Sus: 'Suspended',
};

// Sleeper stores points as an integer plus a two-digit decimal (766 + 44 → 766.44).
const points = (whole = 0, decimal = 0) => whole + decimal / 100;

export function toPlayer(playerId: string, players: SleeperPlayerMap): Player | null {
  if (playerId === EMPTY_SLOT_ID) return null;
  const p = players[playerId];
  return {
    playerId,
    name: p?.name || playerId,
    position: p?.position ?? '',
    nflTeam: p?.team ?? null,
    injuryStatus: (p?.injury_status && INJURY_MAP[p.injury_status]) || null,
  };
}

export function buildStandings(rosters: SleeperRoster[], users: SleeperUser[]): TeamStanding[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const teams = rosters.map((r): TeamStanding => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    return {
      teamId: String(r.roster_id),
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      ownerName: owner?.display_name ?? 'Unclaimed',
      avatarUrl: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
      wins: r.settings.wins,
      losses: r.settings.losses,
      ties: r.settings.ties,
      pointsFor: points(r.settings.fpts, r.settings.fpts_decimal),
      pointsAgainst: points(r.settings.fpts_against, r.settings.fpts_against_decimal),
      rank: 0,
    };
  });

  return rankStandings(teams);
}

function buildStarters(
  slots: string[],
  starterIds: string[],
  starterPoints: number[],
  players: SleeperPlayerMap,
): StarterSlot[] {
  return slots.map((slot, i) => ({
    slot,
    player: toPlayer(starterIds[i] ?? EMPTY_SLOT_ID, players),
    points: starterPoints[i] ?? 0,
  }));
}

// Returns null when none of the league's rosters belong to this account.
export function toLeagueSummary(data: SleeperLeagueData): LeagueSummary | null {
  const { league, rosters, users, matchups, players, myUserId } = data;

  const myRoster = rosters.find(
    (r) => r.owner_id === myUserId || r.co_owners?.includes(myUserId),
  );
  if (!myRoster) return null;

  const standings = buildStandings(rosters, users);
  const teamName = (rosterId: number) =>
    standings.find((t) => t.teamId === String(rosterId))?.teamName ?? `Team ${rosterId}`;
  const starterSlots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));

  const toSide = (m: SleeperMatchup): MatchupSide => ({
    teamId: String(m.roster_id),
    teamName: teamName(m.roster_id),
    points: m.points ?? 0,
    starters: buildStarters(starterSlots, m.starters ?? [], m.starters_points ?? [], players),
  });

  const mine = matchups.find((m) => m.roster_id === myRoster.roster_id);
  const theirs =
    mine?.matchup_id != null
      ? matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id)
      : undefined;

  // The roster's current starters are the lineup you have set right now.
  const currentLineup = buildStarters(starterSlots, myRoster.starters ?? [], [], players);

  return {
    leagueId: league.league_id,
    platform: 'sleeper',
    account: data.account,
    name: league.name,
    season: league.season,
    week: data.week,
    myTeamId: String(myRoster.roster_id),
    standings,
    matchup: mine
      ? { week: data.week, me: toSide(mine), opponent: theirs ? toSide(theirs) : null }
      : null,
    alerts: buildAlerts(currentLineup),
  };
}
