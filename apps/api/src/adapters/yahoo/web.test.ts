import { describe, expect, it } from 'vitest';
import { parseContestedClaims, yahooContestedClaims, YahooCookiesError } from './web.js';

// Made-up teams and players, in the shape of Yahoo's page as of October 2026.
const row = (player: string, position: string, win: number, winner: [number, string], when: string, losers: string) => `<tr>
  <td class="Grid-u-1-12 Pstart-xl Px-lg Py-med"><span class="F-icon Fz-lg Cur-h" title="FAAB Outbid"></span></td>
  <td class="No-pstart">
    <a href="https://sports.yahoo.com/nfl/teams/x/" target="sports">${player}</a>

    <span class="F-position Fz-xxs">${position}</span>
    <a href="https://sports.yahoo.com/nfl/teams/x/" class="yfa-icon playernote" id="playernote-1"></a>
    <h6 class="F-shade">$${win} Winning Offer</h6>
    <div class="Mtop-med Fz-xxs">${losers}</div>
  </td>
  <td class="Fz-xxs">
    Awarded To:
  </td>
  <td class="Ta-end"><div class="Grid-h-top Nowrap Ptop-med">
    <span class="Grid-u">
      <a href="https://football.fantasysports.yahoo.com/f1/777001/${winner[0]}">${winner[1]}</a>
      <span class="Block F-timestamp Nowrap">${when}</span>
    </span>
    <a class="Grid-u" href="/f1/777001/${winner[0]}"><img src="logo.png" alt="logo"> </a>
  </div></td>
</tr>`;
const loser = (id: number, team: string, amount: number, reason = 'Lower Offer') => `<p><a href="https://football.fantasysports.yahoo.com/f1/777001/${id}">${team}</a> $${amount} (${reason})</p>`;
const page = (rows: string[], next = false) => `<html><title>Transactions</title><h2>Recent Transactions</h2>
  <a href="?transactionsfilter=faab">Previous 25</a>${next ? '<a href="?transactionsfilter=faab&amp;count=25">Next 25</a>' : ''}
  <table class="Table Table-mid No-bdr Tst-transaction-table"><tbody>${rows.join('\n')}</tbody></table>
  <table><tr><td>$9 Winning Offer, somewhere else on the page</td></tr></table></html>`;

const defense = row('Made Up Defense', 'Bal - DEF', 4, [12, 'The Fakes'], 'Oct 14,3:59 am', loser(1, 'Mine &amp; Yours', 4, 'Invalid claim due to previous transaction') + loser(7, 'Rival&#039;s Team', 0));
const back = row('Fake O&#039;Runner Jr.', 'Mia - RB Q', 7, [1, 'Mine &amp; Yours'], 'Oct 9,3:32 am', loser(3, 'Others', 7, 'Lower waiver priority'));

/** A fake fetch that answers with each response in turn, recording the URLs and options it's given. */
function scripted(responses: Response[]) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return responses[Math.min(seen.length - 1, responses.length - 1)]!;
  }) as unknown as typeof fetch;
  return { fetchImpl, seen, sleep: async () => {} };
}
const ok = (html: string) => new Response(html, { status: 200 });

describe('parseContestedClaims', () => {
  it('reads the player, the winner, and every losing bid with why it lost', () => {
    expect(parseContestedClaims(page([defense]), '1')).toEqual([
      {
        player: 'Made Up Defense',
        position: 'DEF',
        nflTeam: 'Bal',
        when: 'Oct 14, 3:59 am',
        winner: { team: 'The Fakes', mine: false, amount: 4, reason: null },
        losers: [
          { team: 'Mine & Yours', mine: true, amount: 4, reason: 'Invalid claim due to previous transaction' },
          { team: "Rival's Team", mine: false, amount: 0, reason: 'Lower Offer' },
        ],
      },
    ]);
  });

  it('handles injury tags, and marks your own win', () => {
    const [claim] = parseContestedClaims(page([back]), '1');
    expect(claim).toMatchObject({ player: "Fake O'Runner Jr.", position: 'RB', nflTeam: 'Mia', winner: { mine: true, amount: 7 }, losers: [{ reason: 'Lower waiver priority' }] });
  });

  it('is empty when the page has nothing to list', () => {
    expect(parseContestedClaims('<h2>Recent Transactions</h2><p>No transactions</p>', '1')).toEqual([]);
    expect(parseContestedClaims(page([]), '1')).toEqual([]);
  });

  it('treats a sign-in page as a refused cookie', () => {
    expect(() => parseContestedClaims('<title>Use passkey | Sign in | Yahoo</title>', '1')).toThrow(YahooCookiesError);
  });

  it('says so rather than dropping claims when the page changes', () => {
    expect(() => parseContestedClaims('<html>something else</html>', '1')).toThrow(/has changed/);
    expect(() => parseContestedClaims(page(['<tr><td>$5 Winning Offer, laid out anew</td></tr>']), '1')).toThrow(/has changed/);
  });
});

describe('yahooContestedClaims', () => {
  it('walks every page, sending the cookie and refusing to follow redirects', async () => {
    const yahoo = scripted([ok(page([defense, back], true)), ok(page([defense]))]);
    const claims = await yahooContestedClaims('1001', '1', 'T=secret', yahoo);
    expect(claims).toHaveLength(3);
    expect(yahoo.seen.map((s) => s.url)).toEqual([
      'https://football.fantasysports.yahoo.com/f1/1001/transactions?transactionsfilter=faab',
      'https://football.fantasysports.yahoo.com/f1/1001/transactions?transactionsfilter=faab&count=2',
    ]);
    expect(yahoo.seen[0]!.init).toMatchObject({ headers: { Cookie: 'T=secret' }, redirect: 'manual' });
  });

  it('keeps the answer for a while, so one page load is one visit', async () => {
    const yahoo = scripted([ok(page([defense]))]);
    await yahooContestedClaims('1002', '1', 'T=secret', yahoo);
    await yahooContestedClaims('1002', '1', 'T=secret', yahoo);
    expect(yahoo.seen).toHaveLength(1);
  });

  it('treats a redirect to sign in as a refused cookie, without following it', async () => {
    const yahoo = scripted([new Response(null, { status: 302, headers: { location: 'https://login.yahoo.com/' } })]);
    await expect(yahooContestedClaims('1003', '1', 'T=secret', yahoo)).rejects.toBeInstanceOf(YahooCookiesError);
    expect(yahoo.seen).toHaveLength(1);
  });

  it('never repeats the cookie in an error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Headers.append: "T=secret\n" is an invalid header value.');
    }) as unknown as typeof fetch;
    const failure = await yahooContestedClaims('1004', '1', 'T=secret\n', { fetchImpl, sleep: async () => {} }).catch((e: Error) => e);
    expect((failure as Error).message).not.toContain('secret');
  });
});
