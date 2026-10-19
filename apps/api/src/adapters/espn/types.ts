// Raw response shapes from ESPN's unofficial fantasy API (only the fields we use).
// https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}

export interface EspnStat {
  scoringPeriodId: number;
  statSourceId: number; // 0 = actual, 1 = projected
  appliedTotal?: number;
}

export interface EspnPlayer {
  id: number;
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  injuryStatus?: string;
  stats?: EspnStat[];
}

export interface EspnRosterEntry {
  playerId: number;
  lineupSlotId: number;
  playerPoolEntry?: {
    appliedStatTotal?: number;
    player: EspnPlayer;
  };
}

export interface EspnRoster {
  entries: EspnRosterEntry[];
}

export interface EspnRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface EspnTeam {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  logo?: string;
  owners?: string[];
  record?: { overall?: EspnRecord };
  roster?: EspnRoster;
}

export interface EspnMember {
  id: string; // SWID, e.g. "{ABC-123}"
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface EspnMatchupSide {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPointsLive?: number; // ESPN's in-game projection for the team
  rosterForCurrentScoringPeriod?: EspnRoster;
}

export interface EspnScheduleItem {
  id: number;
  matchupPeriodId: number;
  home?: EspnMatchupSide;
  away?: EspnMatchupSide;
}

export interface EspnLeague {
  id: number;
  seasonId: number;
  scoringPeriodId: number;
  status?: { currentMatchupPeriod?: number };
  settings?: {
    name?: string;
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
  };
  members?: EspnMember[];
  teams?: EspnTeam[];
  schedule?: EspnScheduleItem[];
}
