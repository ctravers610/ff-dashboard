// The platform-neutral data model. Every adapter (Sleeper, ESPN, Yahoo, FFPC)
// converts its own API responses into these shapes, so the web app never
// needs to know which platform a league came from.

export type Platform = 'sleeper' | 'espn' | 'yahoo' | 'ffpc';

export type InjuryStatus = 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'PUP' | 'Suspended' | null;

export interface Player {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: InjuryStatus;
}

export interface StarterSlot {
  slot: string; // roster position, e.g. "QB", "FLEX"
  player: Player | null; // null = empty slot
  points: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  ownerName: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}

export interface MatchupSide {
  teamId: string;
  teamName: string;
  points: number;
  starters: StarterSlot[];
}

export interface Matchup {
  week: number;
  me: MatchupSide;
  opponent: MatchupSide | null; // null on a bye / median-only week
}

export type AlertReason = 'empty' | 'injury';

export interface LineupAlert {
  slot: string;
  playerName: string | null;
  reason: AlertReason;
  detail: string;
}

export type RosterStatus = 'starter' | 'bench' | 'ir';

export interface RosterEntry {
  player: Player;
  status: RosterStatus;
}

export interface LeagueSummary {
  leagueId: string;
  platform: Platform;
  account: string; // which of your accounts owns the team
  name: string;
  season: string;
  week: number;
  myTeamId: string;
  standings: TeamStanding[];
  matchup: Matchup | null;
  alerts: LineupAlert[];
  roster: RosterEntry[]; // every player on your team
}

export interface LeagueRef {
  leagueId: string;
  leagueName: string;
  platform: Platform;
}

// One real-world player and every league he touches you in.
export interface PlayerExposure {
  key: string; // cross-platform identity, e.g. "WR:jaylenwaddle" or "DEF:SF"
  player: Player;
  owned: (LeagueRef & { status: RosterStatus })[];
  facing: LeagueRef[]; // your opponent is starting him this week
}

export interface SourceError {
  source: string;
  message: string;
}

export interface DashboardResponse {
  season: string;
  week: number;
  updatedAt: string;
  leagues: LeagueSummary[];
  players: PlayerExposure[];
  errors: SourceError[];
}
