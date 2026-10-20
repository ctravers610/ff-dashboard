// Raw response shapes from https://docs.sleeper.com (only the fields we use).

export interface SleeperState {
  season: string;
  week: number;
  season_type: string;
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string } | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings?: Record<string, number>; // stat field → points per unit
  settings?: {
    waiver_type?: number; // 0 = rolling, 1 = reverse standings, 2 = FAAB
    waiver_day_of_week?: number; // 2 = Wednesday
    waiver_budget?: number;
    playoff_teams?: number;
    playoff_week_start?: number; // the regular season ends the week before
    league_average_match?: number; // 1: each week also plays the league median
  };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  starters: string[];
  players: string[] | null;
  reserve?: string[] | null; // IR slots
  taxi?: string[] | null; // dynasty taxi squad
  metadata?: { record?: string } | null; // results so far, e.g. "WWLWL"
  settings: {
    waiver_position?: number;
    waiver_budget_used?: number;
    wins: number;
    losses: number;
    ties: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[];
  starters_points: number[];
  players?: string[]; // the whole roster that week
  players_points?: Record<string, number>; // everyone's points, bench included
}

// Trimmed version of the ~5 MB /players/nfl payload, keyed by player id.
export interface SleeperPlayer {
  name: string;
  position: string;
  team: string | null;
  injury_status: string | null;
}

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

// A league transaction (waiver claim, free-agent pickup, trade).
export interface SleeperTransaction {
  type: string; // 'waiver', 'free_agent', 'trade'
  status: string; // 'complete', 'failed', 'pending'
  status_updated: number;
  leg?: number; // the week
  settings?: { waiver_bid?: number } | null;
  adds?: Record<string, number> | null; // player id -> roster id
  drops?: Record<string, number> | null;
  roster_ids?: number[];
  draft_picks?: unknown[];
  waiver_budget?: { sender: number; receiver: number; amount: number }[];
}
