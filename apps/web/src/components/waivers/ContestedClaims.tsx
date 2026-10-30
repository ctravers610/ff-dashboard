import type { ClaimBid, ContestedClaim } from '@ffd/shared';
import { useState } from 'react';

function Bid({ bid }: { bid: ClaimBid }) {
  return (
    <>
      <span className={bid.mine ? 'font-medium text-emerald-300' : ''}>{bid.team}</span> <span className="tabular-nums">${bid.amount}</span>
      {/* "Lower Offer" goes without saying; the other reasons explain a tie or a bid that never counted. */}
      {bid.reason && bid.reason !== 'Lower Offer' && <span className="text-slate-400"> ({bid.reason.toLowerCase()})</span>}
    </>
  );
}

const dayOf = (c: ContestedClaim) => c.when.split(',')[0];

// Every bid on the players more than one team went after: the most recent day's
// claims, then the whole season on request. What others paid, and what they were
// willing to pay and lost, is what to size the next bid against.
export function ContestedClaims({ claims }: { claims: ContestedClaim[] }) {
  const [all, setAll] = useState(false);
  const latest = dayOf(claims[0]!);
  const shown = all ? claims : claims.filter((c) => dayOf(c) === latest);
  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-slate-800">
        {shown.map((c) => (
          <li key={`${c.when}:${c.player}`} className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:items-start">
            <span className="min-w-0">
              <span className="font-medium">{c.player}</span>{' '}
              <span className="text-slate-400">
                {c.position} · {c.nflTeam}
              </span>
              <span className="block text-xs text-slate-400">{c.when}</span>
            </span>
            <span className="min-w-0">
              <span className="text-emerald-400">Won</span> <Bid bid={c.winner} />
              {c.losers.map((b) => (
                <span key={`${b.team}:${b.amount}`} className="block text-xs text-slate-300">
                  <Bid bid={b} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {shown.length < claims.length && (
        <button type="button" onClick={() => setAll(true)} className="self-start rounded-md border border-slate-600 px-2.5 py-0.5 text-sm font-medium text-slate-100 hover:bg-slate-800">
          Show the whole season ({claims.length})
        </button>
      )}
    </div>
  );
}
