// Signed-in sessions, stored in Postgres so they survive restarts and deploys.

import { and, eq, gt, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, type SessionRow } from '../db/schema.js';
import { hashToken, randomToken } from './crypto.js';

export interface SessionUser {
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

const toUser = (row: SessionRow): SessionUser => ({
  githubId: row.githubId,
  login: row.login,
  name: row.name,
  avatarUrl: row.avatarUrl,
});

export function sessionStore(db: Db, { days = 30, now = () => new Date() }: { days?: number; now?: () => Date } = {}) {
  const expiry = () => new Date(now().getTime() + days * DAY);

  return {
    /** Starts a session and returns the token for the cookie. Only its hash is stored. */
    async create(user: SessionUser): Promise<string> {
      const token = randomToken();
      await db.insert(sessions).values({ tokenHash: hashToken(token), ...user, expiresAt: expiry() });
      return token;
    },

    /** The signed-in user for a cookie token, or null if unknown or expired. */
    async find(token: string): Promise<SessionUser | null> {
      const tokenHash = hashToken(token);
      const [row] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now())));
      if (!row) return null;

      // Sliding expiry: an active session keeps renewing, but the row is
      // rewritten at most once a day rather than on every request.
      if (row.expiresAt.getTime() - now().getTime() < (days - 1) * DAY) {
        await db.update(sessions).set({ expiresAt: expiry() }).where(eq(sessions.tokenHash, tokenHash));
      }
      return toUser(row);
    },

    /** Signs out: the token stops working immediately. */
    async remove(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    /** Housekeeping: drops sessions that have already expired. Returns how many. */
    async removeExpired(): Promise<number> {
      const removed = await db.delete(sessions).where(lte(sessions.expiresAt, now())).returning({ h: sessions.tokenHash });
      return removed.length;
    },
  };
}

export type SessionStore = ReturnType<typeof sessionStore>;
