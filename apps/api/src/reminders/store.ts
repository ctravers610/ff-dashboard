// Push subscriptions and per-run reminder state, in Postgres.

import { and, eq, gte, inArray } from 'drizzle-orm';
import { db as appDb, type Db } from '../db/client.js';
import { pushSubscriptions, waiverReminders } from '../db/schema.js';
import { reminderKey, type ReminderState } from './plan.js';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function reminderStore(db: Db) {
  const row = (platform: string, leagueId: string, runAt: Date) =>
    and(eq(waiverReminders.platform, platform), eq(waiverReminders.leagueId, leagueId), eq(waiverReminders.runAt, runAt));

  const upsert = (platform: string, leagueId: string, runAt: Date, set: Partial<typeof waiverReminders.$inferInsert>) =>
    db
      .insert(waiverReminders)
      .values({ platform, leagueId, runAt, ...set })
      .onConflictDoUpdate({ target: [waiverReminders.platform, waiverReminders.leagueId, waiverReminders.runAt], set });

  return {
    async subscribe({ endpoint, keys }: PushSubscriptionInput) {
      await db
        .insert(pushSubscriptions)
        .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth } });
    },
    async unsubscribe(endpoint: string) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },
    async subscriptions(): Promise<PushSubscriptionInput[]> {
      const rows = await db.select().from(pushSubscriptions);
      return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
    },

    setClaims: (platform: string, leagueId: string, runAt: Date, isSet: boolean) =>
      upsert(platform, leagueId, runAt, { claimsSetAt: isSet ? new Date() : null }),
    markReminded: (platform: string, leagueId: string, runAt: Date) => upsert(platform, leagueId, runAt, { remindedAt: new Date() }),

    /** State for every run still ahead, keyed by reminderKey(). */
    async upcoming(now = new Date()): Promise<Map<string, ReminderState>> {
      const rows = await db.select().from(waiverReminders).where(gte(waiverReminders.runAt, now));
      return new Map(rows.map((r) => [reminderKey(r.platform, r.leagueId, r.runAt), { claimsSetAt: r.claimsSetAt, remindedAt: r.remindedAt }]));
    },

    async get(platform: string, leagueId: string, runAt: Date): Promise<ReminderState | null> {
      const [r] = await db.select().from(waiverReminders).where(row(platform, leagueId, runAt));
      return r ? { claimsSetAt: r.claimsSetAt, remindedAt: r.remindedAt } : null;
    },

    // Subscriptions the push service says are gone (the browser unsubscribed or was reset).
    async removeSubscriptions(endpoints: string[]) {
      if (endpoints.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
    },
  };
}

export type ReminderStore = ReturnType<typeof reminderStore>;
export const reminderRepo = reminderStore(appDb);
