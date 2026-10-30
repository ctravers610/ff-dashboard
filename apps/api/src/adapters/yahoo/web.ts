// Yahoo's website, for the one thing its Fantasy API leaves out: losing FAAB bids.
// The API blanks those records (type null, no players), but the league's
// transactions page lists every bid on a contested claim. Reading it needs a
// signed-in Yahoo session, from the YAHOO_COOKIE setting. That session reaches
// far more than Fantasy, so the cookie only ever goes to this one site, redirects
// aren't followed (a redirect here means it was refused), and only GETs are made.

import type { ClaimBid, ContestedClaim } from '@ffd/shared';
import { cached, MINUTE } from '../../cache.js';
import { config } from '../../config.js';
import { fetchWithRetry, type RetryOptions } from './client.js';

const TTL = 30 * MINUTE; // the page only changes when waivers run, and it's a heavy one
const MAX_PAGES = 40; // 25 claims a page

/** Yahoo refused the saved cookie: it expired, or you signed out of Yahoo. */
export class YahooCookiesError extends Error {
  readonly code = 'yahoo-cookies' as const;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(html: string): string {
  return html
    .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (whole, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const changed = (what: string) => new Error(`Yahoo's transactions page has changed (${what}), so its bids can't be read`);

function parseClaim(row: string, myTeamId: string): ContestedClaim {
  const player = /<a [^>]*>([^<]+)<\/a>\s*<span class="F-position[^"]*">([^<]+)<\/span>/.exec(row);
  const nfl = player && /^(\S+) - (\S+)/.exec(decode(player[2]!));
  const winning = /\$(\d+) Winning Offer/.exec(row);
  const winner = /Awarded To:[\s\S]*?<a [^>]*href="[^"]*\/(\d+)"[^>]*>([^<]+)<\/a>[\s\S]*?F-timestamp[^>]*>([^<]+)</.exec(row);
  if (!player || !nfl || !winning || !winner) throw changed('a claim is laid out differently');

  const bid = (teamId: string, team: string, amount: string, reason: string | null): ClaimBid => ({ team: decode(team), mine: teamId === myTeamId, amount: Number(amount), reason });
  return {
    player: decode(player[1]!),
    position: nfl[2]!,
    nflTeam: nfl[1]!,
    when: decode(winner[3]!).replace(/,\s*/, ', '),
    winner: bid(winner[1]!, winner[2]!, winning[1]!, null),
    losers: [...row.matchAll(/<a [^>]*href="[^"]*\/(\d+)"[^>]*>([^<]+)<\/a>\s*\$(\d+)\s*\(([^)]*)\)/g)].map((m) => bid(m[1]!, m[2]!, m[3]!, decode(m[4]!))),
  };
}

/** The claims on one page of /f1/{league}/transactions?transactionsfilter=faab, newest first. */
export function parseContestedClaims(html: string, myTeamId: string): ContestedClaim[] {
  const start = html.indexOf('Tst-transaction-table');
  if (start < 0) {
    if (/Recent Transactions/.test(html)) return []; // the page, with nothing to list
    if (/login\.yahoo\.com|<title>[^<]*sign in/i.test(html)) throw new YahooCookiesError('Yahoo asked for a sign-in instead of showing the league (the cookie may have expired)');
    throw changed('no transactions table');
  }
  const end = html.indexOf('</table>', start);
  return html
    .slice(start, end < 0 ? undefined : end)
    .split(/<tr\b/)
    .filter((row) => row.includes('Winning Offer'))
    .map((row) => parseClaim(row, myTeamId));
}

async function fetchPage(leagueId: string, offset: number, cookie: string, opts: RetryOptions): Promise<string> {
  const url = `${config.upstream.yahooWeb}/f1/${encodeURIComponent(leagueId)}/transactions?transactionsfilter=faab${offset ? `&count=${offset}` : ''}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers: { Cookie: cookie }, redirect: 'manual' }, opts);
  } catch {
    // Not the error itself: fetch quotes a header it finds invalid, and this one is a login.
    throw new Error("Couldn't reach Yahoo's transactions page (or YAHOO_COOKIE isn't a valid header value)");
  }
  if ((res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403) {
    throw new YahooCookiesError(`Yahoo refused the cookie for league ${leagueId} (HTTP ${res.status}; it may have expired)`);
  }
  if (!res.ok) throw new Error(`Yahoo's transactions page returned HTTP ${res.status}`);
  return res.text();
}

/** Every contested claim in a league this season, newest first. Pages one at a time, gently. */
export function yahooContestedClaims(leagueId: string, myTeamId: string, cookie: string, opts: RetryOptions = {}): Promise<ContestedClaim[]> {
  return cached(`yahoo-web:${leagueId}`, TTL, async () => {
    const claims: ContestedClaim[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const html = await fetchPage(leagueId, claims.length, cookie, opts);
      const found = parseContestedClaims(html, myTeamId);
      claims.push(...found);
      if (found.length === 0 || !/>Next \d+<\/a>/.test(html)) break;
    }
    return claims;
  });
}
