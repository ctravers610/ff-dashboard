// Pure functions that turn a raw ESPN league payload into the shared data model.

import type {
  InjuryStatus,
  LeagueSummary,
  MatchupSide,
  Player,
  RosterEntry,
  StarterSlot,
  TeamStanding,
} from '@ffd/shared';
import { liveProjection } from '../../scoring/projection.js';
import { buildAlerts, rankStandings, totalSide } from '../common.js';
import type { EspnLeague, EspnMatchupSide, EspnRosterEntry, EspnTeam } from './types.js';

// ESPN identifies lineup slots, positions and NFL teams by number.
const SLOT_NAMES: Record<number, string> = {
  0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP',
  16: 'D/ST', 17: 'K', 18: 'P', 19: 'HC', 23: 'FLEX',
};
// Display order for starter slots (bench and IR are never starters).
const SLOT_ORDER = [0, 2, 4, 3, 6, 5, 23, 7, 16, 17, 18, 19];
const BENCH_SLOT = 20;
const IR_SLOT = 21;

const POSITIONS: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };

const PRO_TEAMS: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB',
  10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE',
  18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF',
  26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

const INJURY_MAP: Record<string, InjuryStatus> = {
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'Suspended',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const teamName = (t: EspnTeam) =>
  t.name?.trim() || [t.location, t.nickname].filter(Boolean).join(' ').trim() || t.abbrev || `Team ${t.id}`;

function toPlayer(entry: EspnRosterEntry): Player | null {
  const p = entry.playerPoolEntry?.player;
  if (!p) return null;
  return {
    playerId: String(p.id),
    name: p.fullName,
    position: POSITIONS[p.defaultPositionId] ?? '',
    nflTeam: PRO_TEAMS[p.proTeamId] ?? null,
    injuryStatus: (p.injuryStatus && INJURY_MAP[p.injuryStatus]) || null,
  };
}

// Points this player scored in the given week (actual stats, not projections).
// statSourceId 0 = actual points, 1 = ESPN's projection.
function weekStat(entry: EspnRosterEntry, scoringPeriod: number, source: 0 | 1): number | null {
  const stat = entry.playerPoolEntry?.player.stats?.find(
    (s) => s.scoringPeriodId === scoringPeriod && s.statSourceId === source,
  );
  return stat?.appliedTotal != null ? round2(stat.appliedTotal) : null;
}

// Share of each NFL team's game played this week (0 = not started, 1 = final).
export type ProgressFor = (nflTeam: string | null) => number;

// Expand the league's slot counts (e.g. {"2": 2}) into ordered slots and drop
// each rostered starter into the matching slot; unfilled slots stay empty.
export function buildStarters(
  entries: EspnRosterEntry[],
  slotCounts: Record<string, number>,
  scoringPeriod: number,
  progressFor?: ProgressFor,
): StarterSlot[] {
  const starters: StarterSlot[] = [];
  for (const slotId of SLOT_ORDER) {
    const count = slotCounts[String(slotId)] ?? 0;
    const inSlot = entries.filter((e) => e.lineupSlotId === slotId);
    for (let i = 0; i < count; i++) {
      const entry = inSlot[i];
      const player = entry ? toPlayer(entry) : null;
      const points = entry ? (weekStat(entry, scoringPeriod, 0) ?? 0) : 0;
      const projection = entry ? weekStat(entry, scoringPeriod, 1) : null;
      starters.push({
        slot: SLOT_NAMES[slotId] ?? String(slotId),
        player,
        points,
        projected:
          !entry ? 0 : projection == null || !progressFor ? null : liveProjection(points, projection, progressFor(player?.nflTeam ?? null)),
      });
    }
  }
  return starters;
}

export function buildRoster(entries: EspnRosterEntry[]): RosterEntry[] {
  const roster: RosterEntry[] = [];
  for (const entry of entries) {
    const player = toPlayer(entry);
    if (!player) continue;
    const status =
      entry.lineupSlotId === BENCH_SLOT ? 'bench' : entry.lineupSlotId === IR_SLOT ? 'ir' : 'starter';
    roster.push({ player, status });
  }
  return roster;
}

export interface EspnLeagueData {
  league: EspnLeague;
  myTeamId: number;
  account: string;
  progressFor?: ProgressFor; // enables per-player live projections
}

// ESPN lists your team's owners by SWID, the same value as your SWID cookie.
export function findMyTeamId(league: EspnLeague, swid: string): number | null {
  const normalized = swid.toUpperCase();
  const team = league.teams?.find((t) => t.owners?.some((o) => o.toUpperCase() === normalized));
  return team?.id ?? null;
}

export function toLeagueSummary({ league, myTeamId, account, progressFor }: EspnLeagueData): LeagueSummary {
  const teams = league.teams ?? [];
  const membersById = new Map((league.members ?? []).map((m) => [m.id, m]));
  const slotCounts = league.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const scoringPeriod = league.scoringPeriodId;
  const matchupPeriod = league.status?.currentMatchupPeriod ?? scoringPeriod;

  const standings = rankStandings(
    teams.map((t): TeamStanding => {
      const owner = t.owners?.[0] ? membersById.get(t.owners[0]) : undefined;
      const rec = t.record?.overall;
      return {
        teamId: String(t.id),
        teamName: teamName(t),
        ownerName:
          owner?.displayName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'Unknown',
        avatarUrl: t.logo ?? null,
        wins: rec?.wins ?? 0,
        losses: rec?.losses ?? 0,
        ties: rec?.ties ?? 0,
        pointsFor: round2(rec?.pointsFor ?? 0),
        pointsAgainst: round2(rec?.pointsAgainst ?? 0),
        rank: 0,
      };
    }),
  );

  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const rosterFor = (side: EspnMatchupSide) =>
    side.rosterForCurrentScoringPeriod?.entries ?? teamsById.get(side.teamId)?.roster?.entries ?? [];

  const toSide = (side: EspnMatchupSide): MatchupSide => {
    const team = teamsById.get(side.teamId);
    const starters = buildStarters(rosterFor(side), slotCounts, scoringPeriod, progressFor);
    return {
      teamId: String(side.teamId),
      teamName: team ? teamName(team) : `Team ${side.teamId}`,
      points: round2(side.totalPointsLive ?? side.totalPoints ?? 0),
      // Prefer ESPN's own live team projection; fall back to summing starters.
      projected:
        side.totalProjectedPointsLive != null ? round2(side.totalProjectedPointsLive) : totalSide(starters).projected,
      starters,
    };
  };

  const game = league.schedule?.find(
    (g) => g.matchupPeriodId === matchupPeriod && (g.home?.teamId === myTeamId || g.away?.teamId === myTeamId),
  );
  const mine = game && (game.home?.teamId === myTeamId ? game.home : game.away);
  const theirs = game && (game.home?.teamId === myTeamId ? game.away : game.home);

  const myEntries = teamsById.get(myTeamId)?.roster?.entries ?? [];

  return {
    leagueId: String(league.id),
    platform: 'espn',
    account,
    name: league.settings?.name ?? `ESPN league ${league.id}`,
    season: String(league.seasonId),
    week: matchupPeriod,
    myTeamId: String(myTeamId),
    standings,
    matchup: mine
      ? { week: matchupPeriod, me: toSide(mine), opponent: theirs ? toSide(theirs) : null }
      : null,
    alerts: buildAlerts(buildStarters(myEntries, slotCounts, scoringPeriod)),
    roster: buildRoster(myEntries),
  };
}
