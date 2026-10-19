// GitHub's OAuth web flow, as documented at
// https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
// No scopes are requested: the public profile (id, login, name, avatar) is all we need.

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GithubClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthUrl: string; // https://github.com
  apiUrl: string; // https://api.github.com
}

export function githubClient(cfg: GithubClientConfig) {
  return {
    /** Step 1: where to send the browser. `state` comes back unchanged and is checked in step 2. */
    authorizeUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        state,
        allow_signup: 'false',
      });
      return `${cfg.oauthUrl}/login/oauth/authorize?${params}`;
    },

    /** Step 2: trade the one-time code for an access token (server to server, with the secret). */
    async exchangeCode(code: string): Promise<string> {
      const res = await fetch(`${cfg.oauthUrl}/login/oauth/access_token`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.redirectUri }),
      });
      // GitHub reports a bad code as HTTP 200 with an "error" field.
      const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
      if (!res.ok || !body.access_token) {
        throw new Error(`GitHub sign-in failed: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`);
      }
      return body.access_token;
    },

    /** Step 3: who signed in. The token is used once here and then discarded. */
    async fetchUser(accessToken: string): Promise<GithubUser> {
      const res = await fetch(`${cfg.apiUrl}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fantasy-dashboard', // GitHub's API requires one
        },
      });
      if (!res.ok) throw new Error(`GitHub user lookup failed: HTTP ${res.status}`);
      return (await res.json()) as GithubUser;
    },
  };
}

export type GithubClient = ReturnType<typeof githubClient>;
