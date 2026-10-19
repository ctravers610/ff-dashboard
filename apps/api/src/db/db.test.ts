// Integration tests against a real Postgres (see db/testing.ts). They are skipped
// when no database is reachable, except in CI, where a missing database is a failure.

import type { LeagueSummary, ManualLeague, ManualLeagueInput } from '@ffd/shared';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { manualLeagueStore } from '../adapters/manual/store.js';
import { buildApp } from '../app.js';
import crypto from 'node:crypto';
import { hashToken } from '../auth/crypto.js';
import { reminderKey } from '../reminders/plan.js';
import { reminderStore } from '../reminders/store.js';
import { sessionStore } from '../auth/sessions.js';
import { oauthTokenStore } from '../auth/tokens.js';
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

  it('survives the server dropping its connections, then reconnects', async () => {
    await testDb.db.execute(sql`select 1`); // opens a pooled connection
    await testDb.killConnections();
    await new Promise((r) => setTimeout(r, 300)); // let the pool notice the dropped connection

    // A restart must not crash the process, and the next query gets a fresh connection.
    const result = await testDb.db.execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });
  });

  const input: ManualLeagueInput ={ name: 'League A', teamName: 'Team A', rosterText: 'QB Josh Allen', matchup: null };

  it('the deep health check reports a reachable, migrated database', async () => {
    const app = await buildApp({ logger: false, webDist: null, database: testDb.db });
    const res = await app.inject({ url: '/api/health?deep=1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, database: 'ok' });
  });

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

    it("deleting a league also deletes its history, but not other leagues' history", async () => {
      const store = manualLeagueStore(testDb.db);
      const snapshots = snapshotStore(testDb.db);
      const doomed = await store.create(input);
      const kept = await store.create(input);
      const row = (leagueId: string, platform = 'ffpc'): NewSnapshot => ({
        platform,
        leagueId,
        leagueName: 'x',
        season: '2031',
        week: 1,
        points: 1,
      });
      await snapshots.save([row(doomed.id), row(kept.id), row(doomed.id, 'sleeper')]); // same id on another platform is unrelated

      expect(await store.remove(doomed.id)).toBe(true);
      const left = await snapshots.listForSeason('2031');
      expect(left.map((r) => `${r.platform}:${r.leagueId === kept.id ? 'kept' : 'doomed'}`).sort()).toEqual([
        'ffpc:kept',
        'sleeper:doomed',
      ]);
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
        waiversCapturedAt: null,
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

  describe('session store', () => {
    const user = { githubId: 344820607, login: 'owner', name: 'The Owner', avatarUrl: null };
    const DAY = 24 * 60 * 60 * 1000;
    // A controllable clock, so tests can move days ahead instantly.
    const clock = (start = Date.parse('2026-10-19T12:00:00Z')) => {
      let t = start;
      return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
    };

    it('finds the user for a session token and never stores the token itself', async () => {
      const store = sessionStore(testDb.db);
      const token = await store.create(user);
      expect(await store.find(token)).toEqual(user);

      const rows = await testDb.db.execute(sql`select * from sessions`);
      expect(JSON.stringify(rows.rows)).not.toContain(token);
    });

    it('rejects an unknown token', async () => {
      expect(await sessionStore(testDb.db).find('made-up-token')).toBeNull();
    });

    it('expires after 30 days without use', async () => {
      const c = clock();
      const store = sessionStore(testDb.db, { now: c.now });
      const token = await store.create(user);
      c.advance(29 * DAY);
      expect(await store.find(token)).toEqual(user); // still valid on day 29 (and renewed)
      c.advance(31 * DAY);
      expect(await store.find(token)).toBeNull(); // 31 idle days after that renewal
    });

    it('keeps renewing while in use, writing at most once a day', async () => {
      const c = clock();
      const store = sessionStore(testDb.db, { now: c.now });
      const token = await store.create(user);
      // Raw SQL through Drizzle returns timestamps as strings.
      const expiresAt = async () =>
        new Date(
          (await testDb.db.execute(sql`select expires_at from sessions where token_hash = ${hashToken(token)}`)).rows[0]!
            .expires_at as string,
        );

      const first = (await expiresAt()).getTime();
      c.advance(60 * 60 * 1000); // an hour later: no rewrite
      await store.find(token);
      expect((await expiresAt()).getTime()).toBe(first);

      c.advance(2 * DAY); // two days later: renewed to 30 days from now
      await store.find(token);
      expect((await expiresAt()).getTime()).toBe(c.now().getTime() + 30 * DAY);
    });

    it('signing out makes the token stop working immediately', async () => {
      const store = sessionStore(testDb.db);
      const token = await store.create(user);
      await store.remove(token);
      expect(await store.find(token)).toBeNull();
    });

    it('clears out expired sessions, keeping live ones', async () => {
      const c = clock();
      const store = sessionStore(testDb.db, { now: c.now });
      await testDb.db.execute(sql`delete from sessions`);
      const old = await store.create(user);
      c.advance(20 * DAY);
      const recent = await store.create(user);
      c.advance(15 * DAY); // the first is now 35 days old, the second 15

      expect(await store.removeExpired()).toBe(1);
      expect(await store.find(old)).toBeNull();
      expect(await store.find(recent)).toEqual(user);
    });
  });

  describe('encrypted OAuth token store', () => {
    const key = crypto.randomBytes(32);
    const tokens = { accessToken: 'yahoo-access-abc', refreshToken: 'yahoo-refresh-xyz', expiresAt: Date.parse('2026-10-19T13:00:00Z') };

    it('saves and loads tokens, keeping only ciphertext in the table', async () => {
      const store = oauthTokenStore(testDb.db, () => key, 'yahoo');
      await store.save(tokens);
      expect(await store.load()).toEqual(tokens);

      const raw = JSON.stringify((await testDb.db.execute(sql`select * from oauth_tokens`)).rows);
      expect(raw).not.toContain('yahoo-access-abc');
      expect(raw).not.toContain('yahoo-refresh-xyz');
    });

    it('replaces the stored tokens on refresh, and removes them on disconnect', async () => {
      const store = oauthTokenStore(testDb.db, () => key, 'yahoo');
      await store.save(tokens);
      await store.save({ ...tokens, accessToken: 'refreshed' });
      expect((await store.load())?.accessToken).toBe('refreshed');
      await store.remove();
      expect(await store.load()).toBeNull();
    });

    it('cannot be read with a different key', async () => {
      await oauthTokenStore(testDb.db, () => key, 'yahoo').save(tokens);
      await expect(oauthTokenStore(testDb.db, () => crypto.randomBytes(32), 'yahoo').load()).rejects.toThrow();
    });
  });

  describe('reminder store', () => {
    const runAt = new Date('2030-01-02T08:00:00Z'); // in the future, so it counts as upcoming

    it('keeps one row per league and run, recording claims set and reminders sent', async () => {
      const store = reminderStore(testDb.db);
      await store.setClaims('sleeper', 'L1', runAt, true);
      await store.markReminded('sleeper', 'L1', runAt);
      const state = await store.get('sleeper', 'L1', runAt);
      expect(state?.claimsSetAt).toBeInstanceOf(Date);
      expect(state?.remindedAt).toBeInstanceOf(Date);

      await store.setClaims('sleeper', 'L1', runAt, false); // undo keeps the reminder record
      expect(await store.get('sleeper', 'L1', runAt)).toMatchObject({ claimsSetAt: null, remindedAt: expect.any(Date) });
      expect([...(await store.upcoming(new Date('2030-01-01T00:00:00Z'))).keys()]).toEqual([reminderKey('sleeper', 'L1', runAt)]);
      expect((await store.upcoming(new Date('2030-01-03T00:00:00Z'))).size).toBe(0); // past runs drop out
    });

    it('stores a browser subscription once, updates its keys, and removes it', async () => {
      const store = reminderStore(testDb.db);
      await store.subscribe({ endpoint: 'https://push.example/x', keys: { p256dh: 'one', auth: 'a' } });
      await store.subscribe({ endpoint: 'https://push.example/x', keys: { p256dh: 'two', auth: 'b' } });
      expect(await store.subscriptions()).toEqual([{ endpoint: 'https://push.example/x', keys: { p256dh: 'two', auth: 'b' } }]);
      await store.removeSubscriptions(['https://push.example/x']);
      expect(await store.subscriptions()).toEqual([]);
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
