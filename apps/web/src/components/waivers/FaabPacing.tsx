import type { WaiverLeague } from '@ffd/shared';

// How your FAAB spending is tracking against the season, and what winning bids
// have cost in this league, to size the next one.
export function FaabPacing({ league, week, lastWeek }: { league: WaiverLeague; week: number; lastWeek: number }) {
  const r = league.rules;
  if (r?.type !== 'faab' || r.faabLeft == null) return null;
  const weeksLeft = Math.max(1, lastWeek - week + 1);
  const spent = r.faabTotal ? (r.faabTotal - r.faabLeft) / r.faabTotal : null;
  const elapsed = Math.min(1, Math.max(0, (week - 1) / lastWeek));
  const bids = league.bids;

  return (
    <section aria-label="FAAB pacing" className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-2 font-semibold">FAAB pacing</h3>
      <p className="text-sm">
        <span className="font-semibold">${r.faabLeft}</span> left for {weeksLeft} week{weeksLeft > 1 ? 's' : ''}: about{' '}
        <span className="font-semibold">${(r.faabLeft / weeksLeft).toFixed(0)}</span> a week.
      </p>
      {spent != null && (
        <div className="mt-3 flex flex-col gap-1">
          {/* Spent so far against how much of the season has gone. */}
          <div className="relative h-2 rounded-full bg-track" aria-hidden="true">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.round(spent * 100)}%` }} />
            <div className="absolute -top-1 h-4 w-0.5 bg-slate-300" style={{ left: `${Math.round(elapsed * 100)}%` }} />
          </div>
          <p className="text-xs text-slate-400">
            Spent {Math.round(spent * 100)}% of your budget with {Math.round(elapsed * 100)}% of the regular season gone
            {spent < elapsed - 0.15 ? ': room to bid bigger.' : spent > elapsed + 0.15 ? ': ahead of pace, so pick your spots.' : ': on pace.'}
          </p>
        </div>
      )}
      {bids && (
        <div className="mt-3 text-sm">
          <p>
            Winning bids here this season: median <span className="font-semibold">${bids.median}</span>, most{' '}
            <span className="font-semibold">${bids.high}</span> <span className="text-slate-400">({bids.count} claims)</span>
          </p>
          {bids.top.length > 0 && (
            <p className="text-xs text-slate-400">
              Biggest: {bids.top.map((b) => `${b.name} ${b.position} $${b.bid}${b.week ? ` (wk ${b.week})` : ''}`).join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
