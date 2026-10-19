import type { CostlyCall, LineupRecap as Recap, RecapResponse } from '@ffd/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';

const one = (n: number) => n.toFixed(1);

function Call({ c }: { c: CostlyCall }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="text-slate-400">{c.slot}:</span> {c.better.name} <span className="text-slate-400">({one(c.better.points)})</span> over{' '}
        {c.started.name} <span className="text-slate-400">({one(c.started.points)})</span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-amber-300">+{one(c.cost)}</span>
    </li>
  );
}

// One league's recap for the chosen week: score against the best lineup,
// the calls that cost points, and free agents who'd have helped.
function RecapBody({ r }: { r: Recap }) {
  const share = r.best > 0 ? Math.round((r.points / r.best) * 100) : 100;
  return (
    <div className="flex flex-col gap-3">
      {r.result && (
        <p className={`text-sm font-semibold ${r.result === 'win' ? 'text-emerald-400' : r.result === 'loss' ? 'text-rose-300' : 'text-slate-300'}`}>
          {r.result === 'win' ? 'Won' : r.result === 'loss' ? 'Lost' : 'Tied'} {one(r.points)}–{one(r.opponentPoints!)}
        </p>
      )}
      <p className="text-sm text-slate-300">
        {r.leftOnBench > 0 ? (
          <>
            Scored <span className="font-semibold tabular-nums">{one(r.points)}</span> of a possible{' '}
            <span className="font-semibold tabular-nums">{one(r.best)}</span> ({share}%): <span className="font-semibold text-amber-300">{one(r.leftOnBench)}</span>{' '}
            left on the bench.
          </>
        ) : (
          <>Started the best possible lineup: {one(r.points)}.</>
        )}
      </p>
      {r.bestWouldWin && (
        <p role="note" className="rounded-md bg-rose-950/70 px-3 py-2 text-sm font-medium text-rose-200 ring-1 ring-rose-700">
          The best lineup ({one(r.best)}) would have won this one.
        </p>
      )}
      {r.calls.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">From your bench</h4>
          <ul className="divide-y divide-slate-800">
            {r.calls.map((c) => (
              <Call key={`${c.slot}:${c.better.name}`} c={c} />
            ))}
          </ul>
        </div>
      )}
      {r.missedPickups && r.missedPickups.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available on waivers</h4>
          <ul className="divide-y divide-slate-800">
            {r.missedPickups.map((c) => (
              <Call key={`${c.slot}:${c.better.name}`} c={c} />
            ))}
          </ul>
        </div>
      )}
      {r.pickupsNote && <p className="text-xs text-slate-400">{r.pickupsNote}</p>}
    </div>
  );
}

/**
 * The lineup recap for one league, with its own week picker (finished weeks only).
 * `week` null means the latest finished week.
 */
export function RecapPanel({ leagueKey, week, onWeek }: { leagueKey: string; week: number | null; onWeek: (w: number) => void }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['recap', week],
    queryFn: () => api<RecapResponse>(`/api/recap${week ? `?week=${week}` : ''}`),
  });

  let body;
  if (isPending) body = <p className="text-sm text-slate-400">Loading…</p>;
  else if (error) body = <p role="alert" className="text-sm text-rose-300">Couldn't load the lineup recap: {error.message}</p>;
  else if (data.weeks.length === 0) body = <p className="text-sm text-slate-400">No finished weeks yet.</p>;
  else {
    const r = data.leagues.find((l) => `${l.platform}:${l.leagueId}` === leagueKey);
    // Errors name a league ("espn:123") or a whole platform ("sleeper").
    const problem = data.errors.find((e) => e.source === leagueKey || e.source === leagueKey.split(':')[0]);
    body = r ? (
      <RecapBody r={r} />
    ) : (
      <p className="text-sm text-slate-400">{problem ? problem.message : `No recap for this league in week ${data.week}.`}</p>
    );
  }

  return (
    <section aria-label="Lineup recap" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Lineup recap</h3>
        {data && data.weeks.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Week
            <select value={data.week} onChange={(e) => onWeek(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
              {data.weeks.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {body}
      <p className="text-xs text-slate-400">
        "Best" is the highest-scoring legal lineup from your roster that week. Available players may not have been easy to get: someone could have outbid
        you, or they were on waivers.
      </p>
    </section>
  );
}
