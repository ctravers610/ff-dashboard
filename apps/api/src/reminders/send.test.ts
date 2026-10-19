import type { WaiverLeague } from '@ffd/shared';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { reminderKey, type ReminderState } from './plan.js';
import { reminderRoutes } from './routes.js';
import { sendDueReminders, sendToAll, type Sender } from './send.js';
import type { PushSubscriptionInput, ReminderStore } from './store.js';

// The store's behavior, in memory: enough to test sending without Postgres.
function memoryStore() {
  const subs = new Map<string, PushSubscriptionInput>();
  const state = new Map<string, ReminderState>();
  const touch = (platform: string, leagueId: string, runAt: Date, patch: Partial<ReminderState>) => {
    const key = reminderKey(platform, leagueId, runAt);
    state.set(key, { claimsSetAt: null, remindedAt: null, ...state.get(key), ...patch });
  };
  const store = {
    subscribe: async (s: PushSubscriptionInput) => void subs.set(s.endpoint, s),
    unsubscribe: async (endpoint: string) => void subs.delete(endpoint),
    subscriptions: async () => [...subs.values()],
    setClaims: async (p: string, l: string, at: Date, isSet: boolean) => touch(p, l, at, { claimsSetAt: isSet ? new Date() : null }),
    markReminded: async (p: string, l: string, at: Date) => touch(p, l, at, { remindedAt: new Date() }),
    upcoming: async () => state,
    get: async (p: string, l: string, at: Date) => state.get(reminderKey(p, l, at)) ?? null,
    removeSubscriptions: async (endpoints: string[]) => endpoints.forEach((e) => subs.delete(e)),
  } as unknown as ReminderStore; // the real store's methods return query builders; these return plain promises
  return { store, subs, state };
}

const sub = (endpoint: string): PushSubscriptionInput => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } });

// A sender that records payloads; endpoints containing "gone" act like an expired subscription.
function fakeSender() {
  const sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const sender: Sender = async (s, payload) => {
    if (s.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
  };
  return { sender, sent };
}

const league: WaiverLeague = {
  leagueId: 'L1',
  platform: 'sleeper',
  name: 'Test League',
  rules: null,
  moves: [],
  available: [],
  openRosterSpots: 0,
  runs: [{ day: 3, time: '03:00' }],
  runsSource: 'history',
  claims: null,
};

describe('sendToAll', () => {
  it('delivers to every browser and forgets ones the push service says are gone', async () => {
    const { store, subs } = memoryStore();
    await store.subscribe(sub('https://push.example/a'));
    await store.subscribe(sub('https://push.example/gone'));
    const { sender, sent } = fakeSender();

    expect(await sendToAll(store, sender, { title: 'Hi' })).toEqual({ sent: 1, removed: 1 });
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example/a']);
    expect([...subs.keys()]).toEqual(['https://push.example/a']);
  });
});

describe('sendDueReminders', () => {
  it('sends a due reminder once, however often the check runs', async () => {
    const { store } = memoryStore();
    await store.subscribe(sub('https://push.example/a'));
    const { sender, sent } = fakeSender();
    const tuesday9pm = new Date('2026-10-21T01:05:00Z');

    expect(await sendDueReminders([league], store, sender, tuesday9pm)).toBe(1);
    expect(await sendDueReminders([league], store, sender, new Date('2026-10-21T01:10:00Z'))).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ title: 'Test League: waivers Tue night', platform: 'sleeper', leagueId: 'L1' });
  });

  it('sends nothing when you marked the run as set', async () => {
    const { store } = memoryStore();
    await store.subscribe(sub('https://push.example/a'));
    await store.setClaims('sleeper', 'L1', new Date('2026-10-21T07:00:00Z'), true);
    const { sender, sent } = fakeSender();
    expect(await sendDueReminders([league], store, sender, new Date('2026-10-21T01:05:00Z'))).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe('reminder routes', () => {
  const build = async (sender: Sender | null) => {
    const { store, subs, state } = memoryStore();
    const app = Fastify();
    await app.register(reminderRoutes({ store, sender, publicKey: sender ? 'PUBLIC' : null }));
    return { app, subs, state };
  };

  it('serves the public key, and stores and removes subscriptions', async () => {
    const { app, subs } = await build(fakeSender().sender);
    expect((await app.inject({ url: '/api/push/key' })).json()).toEqual({ publicKey: 'PUBLIC' });
    const body = sub('https://push.example/a');
    expect((await app.inject({ method: 'POST', url: '/api/push/subscriptions', payload: body })).statusCode).toBe(201);
    expect(subs.has(body.endpoint)).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: '/api/push/subscriptions', payload: { endpoint: body.endpoint } })).statusCode).toBe(204);
    expect(subs.size).toBe(0);
  });

  it('rejects a malformed subscription', async () => {
    const { app } = await build(fakeSender().sender);
    expect((await app.inject({ method: 'POST', url: '/api/push/subscriptions', payload: { endpoint: 'not a url' } })).statusCode).toBe(400);
  });

  it('records claims set for a run, and can undo it', async () => {
    const { app, state } = await build(null);
    const payload = { platform: 'sleeper', leagueId: 'L1', runAt: '2026-10-21T07:00:00.000Z', set: true };
    expect((await app.inject({ method: 'PUT', url: '/api/waivers/claims', payload })).statusCode).toBe(204);
    expect(state.get(reminderKey('sleeper', 'L1', new Date(payload.runAt)))?.claimsSetAt).toBeInstanceOf(Date);
    await app.inject({ method: 'PUT', url: '/api/waivers/claims', payload: { ...payload, set: false } });
    expect(state.get(reminderKey('sleeper', 'L1', new Date(payload.runAt)))?.claimsSetAt).toBeNull();
  });

  it('explains when reminders are not set up on the server', async () => {
    const { app } = await build(null);
    expect((await app.inject({ url: '/api/push/key' })).json()).toEqual({ publicKey: null });
    const res = await app.inject({ method: 'POST', url: '/api/push/test' });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('VAPID');
  });
});
