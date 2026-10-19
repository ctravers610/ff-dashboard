// OAuth tokens for connected services, stored encrypted in Postgres so they
// survive deploys (a container's disk does not) and are useless if the database leaks.

import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { oauthTokens } from '../db/schema.js';
import { decrypt, encrypt } from './crypto.js';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

/** `getKey` is called only when a token is read or written, so a missing key fails there, with a clear message. */
export function oauthTokenStore(db: Db, getKey: () => Buffer, provider: string) {
  return {
    async load(): Promise<StoredTokens | null> {
      const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, provider));
      if (!row) return null;
      const key = getKey();
      return {
        accessToken: decrypt(row.accessToken, key),
        refreshToken: decrypt(row.refreshToken, key),
        expiresAt: row.expiresAt.getTime(),
      };
    },

    async save(tokens: StoredTokens): Promise<void> {
      const key = getKey();
      const values = {
        accessToken: encrypt(tokens.accessToken, key),
        refreshToken: encrypt(tokens.refreshToken, key),
        expiresAt: new Date(tokens.expiresAt),
        updatedAt: new Date(),
      };
      await db
        .insert(oauthTokens)
        .values({ provider, ...values })
        .onConflictDoUpdate({ target: oauthTokens.provider, set: values });
    },

    async remove(): Promise<void> {
      await db.delete(oauthTokens).where(eq(oauthTokens.provider, provider));
    },
  };
}

export type OAuthTokenStore = ReturnType<typeof oauthTokenStore>;
