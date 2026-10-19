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
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  starters: string[];
  players: string[] | null;
  reserve?: string[] | null; // IR slots
  settings: {
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
}

// Trimmed version of the ~5 MB /players/nfl payload, keyed by player id.
export interface SleeperPlayer {
  name: string;
  position: string;
  team: string | null;
  injury_status: string | null;
}

export type SleeperPlayerMap = Record<string, SleeperPlayer>;
