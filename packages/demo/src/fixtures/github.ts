// GitHub accounts for the sign-in tests. Only OWNER is on the allow-list.

export const GITHUB_CLIENT_ID = 'e2e-client-id';
export const GITHUB_CLIENT_SECRET = 'e2e-client-secret';

export const OWNER = { id: 1001, login: 'e2e-owner', name: 'E2E Owner', avatar_url: null };
export const INTRUDER = { id: 2002, login: 'e2e-intruder', name: 'Someone Else', avatar_url: null };

export const GITHUB_USERS = { owner: OWNER, intruder: INTRUDER } as const;
export type GithubUserKey = keyof typeof GITHUB_USERS;
