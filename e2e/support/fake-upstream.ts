// A stand-in for every outside service the app talks to (Sleeper, ESPN, GitHub), serving
// the fixtures. Run on its own: `tsx support/fake-upstream.ts`.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import * as espn from '../fixtures/espn.js';
import * as ffpc from '../fixtures/ffpc.js';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_USERS, type GithubUserKey } from '../fixtures/github.js';
import { ALL_PLAYERS, GAMES, SEASON, WEEK } from '../fixtures/players.js';
import * as sleeper from '../fixtures/sleeper.js';
import { UPSTREAM_PORT } from './env.js';

type Json = unknown;
type Reply = { status?: number; body: Json };

// Projected stats for every player; the games are all final, so the app ends up
// showing actual points, and these only need to exist and parse.
const projectionRows = () =>
  ALL_PLAYERS.map((p) => ({
    player_id: p.id,
    stats: { rec: 4, rec_yd: 50, pass_yd: 200, pass_td: 1, rush_yd: 40, fgm: 1.5, xpm: 2, sack: 2, pts_allow: 20 },
  }));

const scoreboard = () => ({
  events: GAMES.map(([home, homeScore, away, awayScore]) => ({
    competitions: [
      {
        status: { clock: 0, period: 4, type: { state: 'post' } },
        competitors: [
          { score: String(homeScore), team: { abbreviation: home } },
          { score: String(awayScore), team: { abbreviation: away } },
        ],
      },
    ],
  })),
});

function route(url: URL, headers: http.IncomingHttpHeaders): Reply | null {
  const p = url.pathname;

  // ── Sleeper ──────────────────────────────────────────────────────────
  if (p === '/sleeper/v1/state/nfl') return { body: sleeper.state };
  if (p === `/sleeper/v1/user/${sleeper.SLEEPER_USERNAME}` || p === `/sleeper/v1/user/${sleeper.user.user_id}`) return { body: sleeper.user };
  if (p === `/sleeper/v1/user/${sleeper.user.user_id}/leagues/nfl/${SEASON}`) return { body: [sleeper.league] };
  if (p === `/sleeper/v1/league/${sleeper.SLEEPER_LEAGUE_ID}/users`) return { body: sleeper.users };
  if (p === `/sleeper/v1/league/${sleeper.SLEEPER_LEAGUE_ID}/rosters`) return { body: sleeper.rosters };
  const m = /^\/sleeper\/v1\/league\/[^/]+\/matchups\/(\d+)$/.exec(p);
  if (m) return { body: sleeper.matchups(Number(m[1])) };
  if (p === '/sleeper/v1/players/nfl') return { body: sleeper.playersRaw };

  // ── Sleeper stats and projections ────────────────────────────────────
  if (p === `/sleeper-stats/stats/nfl/${SEASON}/${WEEK}`) return { body: ffpc.statsRows() };
  if (p === `/sleeper-stats/projections/nfl/${SEASON}/${WEEK}`) return { body: projectionRows() };

  // ── ESPN ─────────────────────────────────────────────────────────────
  if (p === '/espn/scoreboard') return { body: scoreboard() };
  const e = new RegExp(`^/espn/fantasy/${SEASON}/segments/0/leagues/(\\d+)$`).exec(p);
  if (e) {
    const cookie = headers.cookie ?? '';
    const authed = cookie.includes(`SWID=${espn.ESPN_SWID}`) && cookie.includes(`espn_s2=${espn.ESPN_S2}`);
    if (e[1] === espn.ESPN_FAILING_LEAGUE_ID || !authed) return { status: 401, body: { messages: ['You are not authorized to view this League.'] } };
    if (e[1] === espn.ESPN_LEAGUE_ID) return { body: espn.league() };
  }

  return null;
}

// ── GitHub OAuth ───────────────────────────────────────────────────────
// Who the next sign-in is, or 'cancel' to act as if the user clicked Cancel on
// GitHub's page. Tests set it through /github/_next; it applies once, then goes
// back to the owner, so one test can't leave the next one signed in as someone else.
let next: GithubUserKey | 'cancel' = 'owner';

function github(req: http.IncomingMessage, url: URL, body: string): { redirect: string } | Reply | null {
  const p = url.pathname;

  if (p === '/github/_next' && req.method === 'POST') {
    const who = url.searchParams.get('as');
    if (who !== 'cancel' && !(who && who in GITHUB_USERS)) return { status: 400, body: { error: `unknown user ${who}` } };
    next = who as typeof next;
    return { body: { ok: true } };
  }

  // The authorize page: GitHub would ask the user, we answer straight away.
  if (p === '/github/login/oauth/authorize') {
    if (url.searchParams.get('client_id') !== GITHUB_CLIENT_ID) return { status: 400, body: { error: 'bad client_id' } };
    const back = new URL(url.searchParams.get('redirect_uri')!);
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    if (next === 'cancel') back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', `code-${next}`);
    next = 'owner';
    return { redirect: back.toString() };
  }

  if (p === '/github/login/oauth/access_token' && req.method === 'POST') {
    const { client_id, client_secret, code } = JSON.parse(body || '{}') as Record<string, string>;
    const who = code?.replace(/^code-/, '');
    if (client_id !== GITHUB_CLIENT_ID || client_secret !== GITHUB_CLIENT_SECRET) return { body: { error: 'incorrect_client_credentials' } };
    if (!who || !(who in GITHUB_USERS)) return { body: { error: 'bad_verification_code' } }; // GitHub answers 200 with an error
    return { body: { access_token: `token-${who}`, token_type: 'bearer', scope: '' } };
  }

  if (p === '/github-api/user') {
    const who = req.headers.authorization?.replace(/^Bearer token-/, '');
    if (!who || !(who in GITHUB_USERS)) return { status: 401, body: { message: 'Bad credentials' } };
    return { body: GITHUB_USERS[who as GithubUserKey] };
  }

  return null;
}

export function createFakeUpstream() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const reply = github(req, url, body) ?? route(url, req.headers);
      if (reply && 'redirect' in reply) {
        res.writeHead(302, { Location: reply.redirect });
        return res.end();
      }
      const { status = 200, body: json } = reply ?? { status: 404, body: { error: `no fixture for ${req.url}` } };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
}

// Started directly (as a Playwright web server), not imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createFakeUpstream().listen(UPSTREAM_PORT, '127.0.0.1', () => console.log(`fake upstream on :${UPSTREAM_PORT}`));
}
