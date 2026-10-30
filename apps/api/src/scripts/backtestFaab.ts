// npm run backtest:faab
//
// How well likely FAAB bids and their odds (waivers/pricing.ts) would have done.
// Every bid since the second season of history is priced only from claims made
// before it, then compared with what that team really had to beat.

import { sleeperClient } from '../adapters/sleeper/client.js';
import { config } from '../config.js';
import { pool } from '../db/client.js';
import { activeSources } from '../sources/store.js';
import type { WaiverLeagueWithBids } from '../waivers/context.js';
import { fetchEspnWaivers } from '../waivers/espn.js';
import { LAST_REGULAR_WEEK } from '../waivers/moves.js';
import { allClaims } from '../waivers/prices.js';
import { backtest, bidsFaced, calibrate, estimateShare, knownBefore, type PastClaim } from '../waivers/pricing.js';
import { fetchSleeperWaivers } from '../waivers/sleeper.js';
import { fetchYahooWaivers } from '../waivers/yahoo.js';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** What each team that bid really had to beat, leaving out those with no one to beat. */
const realBids = (c: PastClaim) => bidsFaced(c).filter((b) => b != null);

/** The naive guess to beat: the middle of every earlier bid faced. */
function naiveMiss(claims: PastClaim[], scored: PastClaim[]): number[] {
  return scored.flatMap((c) => {
    const earlier = claims.filter((o) => knownBefore(o, c)).flatMap(realBids);
    return earlier.length >= 4 ? realBids(c).map((real) => Math.abs(median(earlier) - real)) : [];
  });
}

function modelMiss(claims: PastClaim[], scored: PastClaim[]): number[] {
  return scored.flatMap((c) => {
    const s = estimateShare(claims.filter((o) => knownBefore(o, c)), c);
    return s ? realBids(c).map((real) => Math.abs(s.typical - real)) : [];
  });
}

async function main() {
  const state = await sleeperClient.state();
  const ctx = { season: state.season, week: state.week, lastWeek: LAST_REGULAR_WEEK, byeTeams: null, trendingAdds: new Map<string, number>() };
  const sources = await activeSources();
  const results = await Promise.all([
    fetchSleeperWaivers(sources.sleeperUsernames, ctx),
    fetchEspnWaivers(sources.espnLeagueIds, config.espnAuth, ctx),
    fetchYahooWaivers(ctx),
  ]);
  const leagues: WaiverLeagueWithBids[] = results.flatMap((r) => r.leagues);
  const claims = await allClaims(leagues, ctx);
  const first = Math.min(...claims.map((c) => c.season));
  if (claims.length === 0 || claims.every((c) => c.season === first)) {
    // Nothing to score against: every bid is from the first season of history.
    console.log(`Likely FAAB bids: ${claims.length} winning bids, all from one season, so nothing to backtest yet. (Is Yahoo set up in .env?)`);
    return;
  }
  // The first season has nothing before it, so scoring starts the season after.
  const later = (c: Pick<PastClaim, 'season'>) => c.season > first;
  const scored = claims.filter(later);
  const b = backtest(claims, (known, c) => (later(c) ? estimateShare(known, c) : null));
  const big = scored.filter((c) => c.share >= 0.1);
  const known = claims.filter((c) => c.rivals);
  const bids = known.reduce((n, c) => n + c.rivals!.length + 1, 0);

  console.log(`Likely FAAB bids, backtested ${new Date().toISOString().slice(0, 10)}`);
  console.log(`  claims: ${claims.length} (${first}–${ctx.season}), ${known.length} with every bid known: ${bids} bids, ${pct(known.filter((c) => c.rivals!.length === 0).length / (bids || 1))} with no one else bidding`);
  console.log(`  bids faced priced from earlier claims: ${b.priced}`);
  console.log(`  real bid inside the range: ${pct(b.inRange)} (aim: 50%)`);
  console.log(`  median miss: ${pct(b.medianMiss)} of the budget (naive guess: ${pct(median(naiveMiss(claims, scored)))})`);
  console.log(`  claims won for 10%+ (${big.length}): mean miss ${pct(mean(modelMiss(claims, big)))} (naive guess: ${pct(mean(naiveMiss(claims, big)))})`);

  // The odds, on the same claims: a bid meant to win 75% of the time should.
  for (const { level, tried, won } of calibrate(claims, later)) {
    if (tried > 0) console.log(`  bids meant to win ${pct(level)}: won ${pct(won / tried)} of ${tried}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
