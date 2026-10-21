import type { TradePiece } from '@ffd/shared';
import { useTradeIdeas } from '../../api';

const pieces = (list: TradePiece[]) =>
  list.map((p) => (
    <span key={p.name} className="block">
      <span className="font-medium">{p.name}</span>{' '}
      <span className="text-slate-400">
        {p.position} · {p.perWeek.toFixed(1)}/wk
      </span>
    </span>
  ));

// Trades worth proposing: each one makes your best lineup and theirs better,
// by rest-of-season projections in this league's scoring.
export function TradeFinder({ leagueKey }: { leagueKey: string }) {
  const { data, error, isPending } = useTradeIdeas(leagueKey);
  if (data && !data.supported) return null; // FFPC: no other rosters to look at

  let body;
  if (isPending) body = <p className="text-sm text-slate-400">Looking for trades…</p>;
  else if (error) body = <p role="alert" className="text-sm text-rose-300">Couldn't look for trades: {error.message}</p>;
  else if (data.weeksLeft === 0) body = <p className="text-sm text-slate-400">The regular season is over.</p>;
  else if (data.ideas.length === 0) body = <p className="text-sm text-slate-400">No trade helps both lineups right now.</p>;
  else
    body = (
      <ul className="divide-y divide-slate-800">
        {data.ideas.map((i) => (
          <li
            key={`${i.partner}:${i.give.map((g) => g.name).join('+')}:${i.get.map((g) => g.name).join('+')}`}
            className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] sm:items-start"
          >
            <span className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">Give</span>
              {pieces(i.give)}
            </span>
            <span className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Get from {i.partner}</span>
              {pieces(i.get)}
            </span>
            <span className="tabular-nums sm:text-right">
              <span className="font-semibold text-emerald-400">+{i.myGain.toFixed(1)}</span> <span className="text-xs text-slate-400">you</span>
              <span className="block text-xs text-slate-400">+{i.theirGain.toFixed(1)} them, per week</span>
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <section aria-label="Trade finder" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">Trade finder</h3>
      {body}
      <p className="text-xs text-slate-400">
        Trades that make both starting lineups better, by each player's projected points a week for the rest of the regular season in this league's
        scoring. Taking two players for one needs an open roster spot (or a drop).
      </p>
    </section>
  );
}
