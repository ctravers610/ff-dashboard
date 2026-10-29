import { describe, expect, it } from 'vitest';
import type { EspnTransaction } from '../adapters/espn/types.js';
import { myPendingClaims } from './espn.js';

const claim = (id: string, extra: Partial<EspnTransaction> = {}): EspnTransaction => ({
  id,
  type: 'WAIVER',
  status: 'PENDING',
  teamId: 4,
  items: [{ type: 'ADD', playerId: Number(id.replace(/\D/g, '')) || 1 }],
  ...extra,
});

describe('myPendingClaims', () => {
  it('keeps your claims that no run has processed yet', () => {
    expect(myPendingClaims([claim('a1'), claim('b2')], 4).map((t) => t.id)).toEqual(['a1', 'b2']);
  });

  // After a run, ESPN leaves each claim PENDING and adds its outcome as a new
  // transaction pointing back at it (seen on a real league, week 8 of 2026).
  it('drops claims a run already won, failed or canceled', () => {
    const transactions = [
      claim('won'),
      claim('lost'),
      claim('pulled'),
      claim('next-run'),
      claim('x1', { status: 'EXECUTED', relatedTransactionId: 'won', processDate: 1 }),
      claim('x2', { status: 'FAILED_INVALIDPLAYERSOURCE', relatedTransactionId: 'lost', processDate: 1 }),
      claim('x3', { status: 'CANCELED', relatedTransactionId: 'pulled' }),
    ];
    expect(myPendingClaims(transactions, 4).map((t) => t.id)).toEqual(['next-run']);
  });

  it("leaves out other teams' claims and other transaction types", () => {
    const transactions = [claim('theirs', { teamId: 7 }), claim('fa', { type: 'FREEAGENT' }), claim('mine')];
    expect(myPendingClaims(transactions, 4).map((t) => t.id)).toEqual(['mine']);
  });
});
