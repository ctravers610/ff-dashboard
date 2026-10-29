// Reads the analytics warehouse (analytics/), a separate database the loader
// and dbt fill. The app only ever reads it: every query runs in a read-only
// transaction, on top of the read-only role production should connect as.

import pg from 'pg';
import { config } from '../config.js';

/** A row of marts.agg_team_season for one of your teams, with its league's name. */
export interface SeasonRow {
  league_id: string;
  league_lineage_id: string;
  league_name: string;
  season: number;
  team_name: string;
  teams: number;
  regular_season_rank: number;
  wins: number;
  losses: number;
  ties: number;
  median_wins: number | null;
  median_losses: number | null;
  median_ties: number | null;
  all_play_wins: number;
  all_play_losses: number;
  all_play_ties: number;
  // Postgres numerics arrive as strings, to keep their precision.
  expected_wins: string;
  luck: string;
  points_for: string;
  points_left_on_bench: string;
  lineup_efficiency: string | null;
  pickups: number;
  faab_spent: number;
  pickup_points_started: string;
}

export interface WarehouseStore {
  mySeasons(): Promise<SeasonRow[]>;
}

const MY_SEASONS = `
  select seasons.*, leagues.league_name
  from marts.agg_team_season as seasons
  join marts.dim_league as leagues on leagues.league_id = seasons.league_id
  where seasons.is_mine
  order by seasons.league_lineage_id, seasons.season desc`;

export function createWarehouseStore(connectionString: string): WarehouseStore {
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    // Belt and braces: read-only and quick, whatever role the URL connects as.
    options: '-c default_transaction_read_only=on -c statement_timeout=10000',
  });
  // An idle connection the server drops is reported as an 'error' event, which would crash the API if unhandled.
  pool.on('error', (err) => console.error('Warehouse connection error (the pool will reconnect):', err.message));
  return {
    mySeasons: async () => (await pool.query<SeasonRow>(MY_SEASONS)).rows,
  };
}

// The app's warehouse, or null when ANALYTICS_DATABASE_URL isn't set.
export const warehouseStore: WarehouseStore | null = config.warehouseUrl ? createWarehouseStore(config.warehouseUrl) : null;
