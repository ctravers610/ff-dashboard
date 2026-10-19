// Yahoo OAuth 2.0 authorization-code flow:
//   1. authorizationUrl() sends the browser to Yahoo's login page with a random `state`.
//   2. Yahoo redirects back to our callback with a one-time `code` and that `state`.
//   3. exchangeCode() trades the code for an access token (1 hour) + refresh token.
//   4. getAccessToken() hands out the access token, refreshing it when it's about to expire.
// Tokens are saved under apps/api/.cache (git-ignored) so you only log in once.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MINUTE } from '../../cache.js';
import { config } from '../../config.js';

const AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
const tokenFile = () => path.join(config.cacheDir, 'yahoo-tokens.json');

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function yahooConfig() {
  if (!config.yahoo) throw new Error('Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in .env');
  return config.yahoo;
}

export const yahooConfigured = () => config.yahoo != null;

// `state` guards against cross-site request forgery: we only accept callbacks
// carrying a state value we generated in the last 10 minutes.
const pendingStates = new Map<string, number>();

export function authorizationUrl(): string {
  const { clientId, redirectUri } = yahooConfig();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * MINUTE);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'fspt-r', // Fantasy Sports read; without it Yahoo issues a token that gets 403s
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export function consumeState(state: string): boolean {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return expires != null && expires > Date.now();
}

let memoryTokens: StoredTokens | null | undefined; // undefined = not loaded from disk yet

async function loadTokens(): Promise<StoredTokens | null> {
  if (memoryTokens !== undefined) return memoryTokens;
  try {
    memoryTokens = JSON.parse(await fs.readFile(tokenFile(), 'utf8')) as StoredTokens;
  } catch {
    memoryTokens = null;
  }
  return memoryTokens;
}

async function saveTokens(tokens: StoredTokens) {
  memoryTokens = tokens;
  await fs.mkdir(config.cacheDir, { recursive: true });
  await fs.writeFile(tokenFile(), JSON.stringify(tokens));
}

async function requestTokens(params: Record<string, string>): Promise<StoredTokens> {
  const { clientId, clientSecret, redirectUri } = yahooConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ redirect_uri: redirectUri, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    throw new Error(`Yahoo token request failed: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`);
  }
  const tokens: StoredTokens = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? params.refresh_token ?? '',
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

export const exchangeCode = (code: string) => requestTokens({ grant_type: 'authorization_code', code });

let refreshing: Promise<StoredTokens> | null = null;

// Returns null when you haven't connected Yahoo yet.
export async function getAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > MINUTE) return tokens.accessToken;

  // Share one refresh between concurrent callers.
  refreshing ??= requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }).finally(
    () => (refreshing = null),
  );
  return (await refreshing).accessToken;
}

export const isConnected = async () => (await loadTokens()) != null;

export async function disconnect() {
  memoryTokens = null;
  await fs.rm(tokenFile(), { force: true });
}
