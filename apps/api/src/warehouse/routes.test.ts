import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { groupByLeague, warehouseRoutes } from './routes.js';
import type { SeasonRow, WarehouseStore } from './store.js';

const row = (over: Partial<SeasonRow>): SeasonRow => ({
  league_id: 'L26',
  league_lineage_id: 'L25',
  league_name: 'Dynasty',
  season: 2026,
  team_name: 'Mine',
  teams: 12,
  regular_season_rank: 4,
  wins: 4,
  losses: 3,
  ties: 0,
  median_wins: null,
  median_losses: null,
  median_ties: null,
  all_play_wins: 50,
  all_play_losses: 27,
  all_play_ties: 0,
  expected_wins: '4.55',
  luck: '-0.55',
  points_for: '1012.40',
  points_left_on_bench: '104.80',
  lineup_efficiency: '0.9062',
  pickups: 10,
  faab_spent: 0,
  pickup_points_started: '75.20',
  ...over,
});

async function get(store: WarehouseStore | null) {
  const app = Fastify({ logger: false });
  await app.register(warehouseRoutes(store));
  return app.inject({ url: '/api/history/seasons' });
}

describe('groupByLeague', () => {
  it("puts a league's seasons together, newest first, named as in its latest season", () => {
    const leagues = groupByLeague([
      row({}),
      row({ league_id: 'L25', season: 2025, league_name: 'Old name', wins: 5, losses: 9, regular_season_rank: 12 }),
      row({ league_id: 'B26', league_lineage_id: 'B26', league_name: 'Best Ball', median_wins: 6, median_losses: 1, median_ties: 0 }),
    ]);
    expect(leagues.map((l) => [l.lineageId, l.name, l.seasons.map((s) => s.season)])).toEqual([
      ['L25', 'Dynasty', [2026, 2025]],
      ['B26', 'Best Ball', [2026]],
    ]);
    expect(leagues[0]!.seasons[1]).toMatchObject({ leagueId: 'L25', finish: 12, record: { wins: 5, losses: 9, ties: 0 }, medianRecord: null });
    expect(leagues[1]!.seasons[0]!.medianRecord).toEqual({ wins: 6, losses: 1, ties: 0 });
  });

  it("turns Postgres numerics into numbers", () => {
    const [season] = groupByLeague([row({})])[0]!.seasons;
    expect(season).toMatchObject({ expectedWins: 4.55, luck: -0.55, pointsFor: 1012.4, pointsLeftOnBench: 104.8, lineupEfficiency: 0.9062, pickupPoints: 75.2 });
  });
});

describe('GET /api/history/seasons', () => {
  it('says the warehouse is unavailable when the app has none', async () => {
    const res = await get(null);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: false, leagues: [] });
  });

  it('returns your leagues from the warehouse', async () => {
    const res = await get({ mySeasons: async () => [row({})] });
    expect(res.json()).toMatchObject({ available: true, leagues: [{ lineageId: 'L25', seasons: [{ season: 2026 }] }] });
  });

  it('answers 503 when the warehouse is unreachable', async () => {
    const res = await get({ mySeasons: () => Promise.reject(new Error('connection refused')) });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/warehouse/);
  });
});
