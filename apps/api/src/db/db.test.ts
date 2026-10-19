// Integration tests against a real Postgres (see db/testing.ts). They are skipped
// when no database is reachable, except in CI, where a missing database is a failure.

import type { LeagueSummary, ManualLeague, ManualLeagueInput } from '@ffd/shared';
import Fastify from 'fastify';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { manualLeagueStore } from '../adapters/manual/store.js';
import { manualLeagueRoutes } from '../routes/manualLeagues.js';
import { snapshotStore, toSnapshot } from '../snapshots.js';
import type { NewSnapshot } from './schema.js';
import { createTestDb, dbAvailable } from './testing.js';

const enabled = Boolean(process.env.CI) || (await dbAvailable());

describe.skipIf(!enabled)('Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  const input: ManualLeagueInput = { name: 'League A', teamName: 'Team A', rosterText: 'QB Josh Allen', matchup: null };

  describe('manual league store', () => {
    it('creates, lists, updates and removes a league', async () => {
      const store = manualLeagueStore(testDb.db);
      const created = await store.create(input);
      expect(created).toMatchObject({ name: 'League A', teamName: 'Team A', platform: 'ffpc', matchup: null });
      expect((await store.list()).map((l) => l.id)).toContain(created.id);

      const updated = await store.update(created.id, { ...input, rosterText: 'QB Drake Maye' });
      expect(updated?.rosterText).toBe('QB Drake Maye');
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

      expect(await store.remove(created.id)).toBe(true);
      expect(await store.remove(created.id)).toBe(false);
      expect(await store.update(created.id, input)).toBeNull();
    });

    it('stores the pasted matchup as JSON and reads it back unchanged', async () => {
      const store = manualLeagueStore(testDb.db);
      const matchup = {
        week: 6,
        capturedAt: '2026-10-19T14:00:00.000Z',
        me: { teamName: 'Team A', points: 10.5, projected: 20, starters: [{ slot: 'QB', name: 'Josh Allen', points: 10.5 }] },
        opponent: { teamName: 'Rival', points: 5, starters: [] },
        scoreboard: [{ teamName: 'Team A', points: 10.5, projected: 20 }],
      };
      const created = await store.create({ ...input, matchup });
      expect((await store.list()).find((l) => l.id === created.id)?.matchup).toEqual(matchup);
    });

    it('imports the old JSON file once, keeping ids, then sets it aside', async () => {
      const store = manualLeagueStore(testDb.db);
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffd-legacy-'));
      const file = path.join(dir, 'manual-leagues.json');
      const legacy: ManualLeague = {
        id: '7ec27bd6-7975-4d5e-8edf-a60a48129ed6',
        platform: 'ffpc',
        name: 'Legacy League',
        teamName: 'Old Team',
        rosterText: 'QB Josh Allen',
        updatedAt: '2026-10-01T12:00:00.000Z',
      };
      await fs.writeFile(file, JSON.stringify([legacy]));

      expect(await store.importLegacyJson(file)).toBe(1);
      const found = (await store.list()).find((l) => l.id === legacy.id);
      expect(found).toMatchObject({ name: 'Legacy League', updatedAt: legacy.updatedAt });

      await expect(fs.access(`${file}.imported`)).resolves.toBeUndefined();
      expect(await store.importLegacyJson(file)).toBe(0); // nothing left to import
      await fs.rm(dir, { recursive: true });
    });
  });

  describe('manual league routes', () => {
    const build = async () => {
      const app = Fastify();
      await app.register(manualLeagueRoutes(manualLeagueStore(testDb.db)));
      return app;
    };

    it('creates a league (201) and rejects a bad body (400)', async () => {
      const app = await build();
      const ok = await app.inject({ method: 'POST', url: '/api/manual-leagues', payload: input });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({ name: 'League A' });

      const bad = await app.inject({ method: 'POST', url: '/api/manual-leagues', payload: { name: '' } });
      expect(bad.statusCode).toBe(400);
    });

    it('rejects a matchup with a non-numeric week', async () => {
      const app = await build();
      const matchup = { week: 'six', capturedAt: '2026-10-19T14:00:00.000Z', me: { teamName: 'a', points: 1, starters: [] }, opponent: { teamName: 'b', points: 1, starters: [] } };
      const res = await app.inject({ method: 'POST', url: '/api/manual-leagues', payload: { ...input, matchup } });
      expect(res.statusCode).toBe(400);
    });

    it('answers 400 for a malformed id, 404 for an unknown one, 204 on delete', async () => {
      const app = await build();
      expect((await app.inject({ method: 'PUT', url: '/api/manual-leagues/not-a-uuid', payload: input })).statusCode).toBe(400);

      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await app.inject({ method: 'PUT', url: `/api/manual-leagues/${unknown}`, payload: input })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/api/manual-leagues/${unknown}` })).statusCode).toBe(404);

      const { id } = (await app.inject({ method: 'POST', url: '/api/manual-leagues', payload: input })).json();
      expect((await app.inject({ method: 'DELETE', url: `/api/manual-leagues/${id}` })).statusCode).toBe(204);
    });
  });

  describe('snapshot store', () => {
    const snapshot = (week: number, points: number, extra: Partial<NewSnapshot> = {}): NewSnapshot => ({
      platform: 'sleeper',
      leagueId: 'L1',
      leagueName: 'League One',
      season: '2026',
      week,
      points,
      ...extra,
    });

    it('keeps one row per league per week, overwriting with the latest capture', async () => {
      const store = snapshotStore(testDb.db);
      await store.save([snapshot(1, 100, { projected: 120 })]);
      await store.save([snapshot(1, 135.5, { projected: 135.5, opponentName: 'Rival', opponentPoints: 99 })]);

      const rows = (await store.listForSeason('2026')).filter((r) => r.leagueId === 'L1' && r.week === 1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ points: 135.5, projected: 135.5, opponentName: 'Rival', opponentPoints: 99 });
    });

    it('backfills missing weeks without overwriting live data', async () => {
      const store = snapshotStore(testDb.db);
      await store.save([snapshot(2, 140)]);
      await store.saveIfMissing([snapshot(2, 1), snapshot(3, 150)]);

      const rows = (await store.listForSeason('2026')).filter((r) => r.leagueId === 'L1');
      expect(Object.fromEntries(rows.map((r) => [r.week, r.points]))).toMatchObject({ 2: 140, 3: 150 });
      expect((await store.weeksFor('sleeper', 'L1', '2026')).sort()).toEqual([1, 2, 3]);
    });

    it('keeps leagues and seasons separate', async () => {
      const store = snapshotStore(testDb.db);
      await store.save([snapshot(1, 50, { leagueId: 'L2', leagueName: 'League Two' }), snapshot(1, 60, { season: '2025' })]);
      expect(await store.weeksFor('sleeper', 'L2', '2026')).toEqual([1]);
      expect(await store.weeksFor('sleeper', 'L1', '2025')).toEqual([1]);
      expect((await store.listForSeason('2025')).every((r) => r.season === '2025')).toBe(true);
    });

    it('stores a snapshot built from a league summary', async () => {
      const store = snapshotStore(testDb.db);
      const league = {
        leagueId: 'F1',
        platform: 'ffpc',
        name: 'FFPC League',
        season: '2026',
        week: 6,
        myTeamId: 'me',
        standings: [],
        alerts: [],
        roster: [],
        matchup: {
          week: 6,
          me: { teamId: 'me', teamName: 'Me', points: 140.45, projected: 150.6, starters: [] },
          opponent: { teamId: 'op', teamName: 'Them', points: 140.7, projected: 166, starters: [] },
          allPlay: { teams: new Array(12).fill(null), winSlots: 6, myRank: 2, myProjectedRank: 2 },
        },
      } as unknown as LeagueSummary;
      await store.save([toSnapshot(league)!]);

      const row = (await store.listForSeason('2026')).find((r) => r.leagueId === 'F1')!;
      expect(row).toMatchObject({ platform: 'ffpc', week: 6, allPlayRank: 2, allPlayTeams: 12, allPlayWinSlots: 6, wins: null });
    });
  });
});
