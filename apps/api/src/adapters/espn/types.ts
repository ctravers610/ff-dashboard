// Raw response shapes from ESPN's unofficial fantasy API (only the fields we use).
// https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}

export interface EspnStat {
  seasonId?: number;
  scoringPeriodId: number; // 0 = the whole season
  statSourceId: number; // 0 = actual, 1 = projected
  statSplitTypeId?: number; // 0 = season, 1 = one week
  appliedTotal?: number; // in this league's scoring
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
  waiverRank?: number; // your place in the claim order, 1 = first
  transactionCounter?: { acquisitionBudgetSpent?: number };
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
  winner?: 'HOME' | 'AWAY' | 'TIE' | 'UNDECIDED';
}

export interface EspnLeague {
  id: number;
  seasonId: number;
  scoringPeriodId: number;
  status?: { currentMatchupPeriod?: number };
  settings?: {
    name?: string;
    scheduleSettings?: { matchupPeriodCount?: number; playoffTeamCount?: number };
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    acquisitionSettings?: {
      acquisitionBudget?: number;
      isUsingAcquisitionBudget?: boolean; // FAAB bidding
      waiverOrderReset?: boolean; // order reset to reverse standings each week, instead of rolling
    };
  };
  members?: EspnMember[];
  teams?: EspnTeam[];
  schedule?: EspnScheduleItem[];
}

// The kona_player_info view: players not on any team in the league.
export interface EspnFreeAgents {
  players: { status: 'FREEAGENT' | 'WAIVERS' | string; player: EspnPlayer }[];
}

// From the mTransactions2 view. Signed in as you, pending waiver claims are yours.
export interface EspnTransaction {
  id?: string;
  type: string; // 'WAIVER', 'FREEAGENT', ...
  status?: string; // 'PENDING', 'EXECUTED', ...
  teamId?: number;
  bidAmount?: number;
  proposedDate?: number;
  processDate?: number;
  scoringPeriodId?: number;
  items?: { type: 'ADD' | 'DROP' | string; playerId: number }[];
  // A processed claim is a new transaction pointing back at the claim, which keeps
  // its PENDING status for good.
  relatedTransactionId?: string;
}
