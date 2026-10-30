import type { ClaimBid, ContestedClaim } from './index';

// A bid that never counted (an invalid claim) didn't push anyone's price up or beat anyone.
export const bidCounted = (b: ClaimBid) => /^lower/i.test(b.reason ?? '');

/** How your bids have fared against the others on contested claims: what you overpaid, and how close your losses were. */
export function yourBidding(claims: ContestedClaim[]): string | null {
  const won = claims.filter((c) => c.winner.mine).map((c) => c.winner.amount - Math.max(0, ...c.losers.filter(bidCounted).map((b) => b.amount)));
  const lost = claims.flatMap((c) => c.losers.filter((b) => b.mine && bidCounted(b)).map((b) => c.winner.amount - b.amount));
  const wins = won.length > 0 ? `won ${won.length} contested claim${won.length > 1 ? 's' : ''}, paying $${(won.reduce((a, b) => a + b, 0) / won.length).toFixed(1)} more than you had to on average` : null;
  const losses = lost.length > 0 ? `lost ${lost.length}, ${lost.filter((gap) => gap <= 2).length} by $2 or less` : null;
  const parts = [wins, losses].filter(Boolean);
  return parts.length > 0 ? `You ${parts.join(' and ')}.` : null;
}
