import { describe, expect, it } from 'vitest';
import { yourBidding } from './contestedClaims';
import type { ClaimBid, ContestedClaim } from './index';

const bid = (mine: boolean, amount: number, reason: string | null = 'Lower Offer'): ClaimBid => ({ team: mine ? 'Me' : 'Them', mine, amount, reason });
const claim = (winner: ClaimBid, ...losers: ClaimBid[]): ContestedClaim => ({ player: 'Fake Back', position: 'RB', nflTeam: 'BUF', when: 'Oct 14, 3:59 am', winner, losers });

describe('how your bids have fared on contested claims', () => {
  it('says what you overpaid when you won, and how close your losses were', () => {
    const claims = [
      claim(bid(true, 10, null), bid(false, 4)), // overpaid by $6
      claim(bid(true, 5, null), bid(false, 3), bid(false, 1)), // by $2
      claim(bid(false, 9, null), bid(true, 8)), // lost by $1
      claim(bid(false, 20, null), bid(true, 5)), // lost by $15
    ];
    expect(yourBidding(claims)).toBe('You won 2 contested claims, paying $4.0 more than you had to on average and lost 2, 1 by $2 or less.');
  });

  it('leaves out bids that never counted', () => {
    const claims = [claim(bid(true, 10, null), bid(false, 40, 'Invalid claim due to previous transaction')), claim(bid(false, 9, null), bid(true, 9, 'Invalid claim due to previous transaction'))];
    expect(yourBidding(claims)).toBe('You won 1 contested claim, paying $10.0 more than you had to on average.');
  });

  it('counts a tie lost on waiver priority as a loss by nothing', () => {
    expect(yourBidding([claim(bid(false, 7, null), bid(true, 7, 'Lower waiver priority'))])).toBe('You lost 1, 1 by $2 or less.');
  });

  it('says nothing when you had no part in them', () => {
    expect(yourBidding([claim(bid(false, 7, null), bid(false, 3))])).toBeNull();
  });
});
