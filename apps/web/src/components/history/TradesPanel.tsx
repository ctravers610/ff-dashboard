import type { TradeReport, TradeSide } from '@ffd/shared';
import { useTrades } from '../../api';

const one = (n: number) => n.toFixed(1);
const signedPts = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

function Side({ side, winner, final }: { side: TradeSide; winner: boolean; final: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className={`truncate font-medium ${side.isMe ? 'text-emerald-300' : ''}`}>
          {side.teamName}
          {side.isMe && <span className="text-xs text-slate-400"> (you)</span>}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${winner ? 'text-emerald-400' : 'text-slate-300'}`} title="Lineup points scored with the trade, minus without it">
          {signedPts(side.gain)}
        </span>
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {side.received.map((p) => (
          <li key={p.name} className="min-w-0 truncate">
            {p.name} <span className="text-slate-400">{p.position}</span>
            <span className="block text-xs text-slate-400">
              {one(p.points)} pts · started {p.startedWeeks} of {p.rosterWeeks} week{p.rosterWeeks === 1 ? '' : 's'}
              {!final && p.restOfSeason != null && ` · ${p.restOfSeason.toFixed(0)} projected to come`}
            </span>
          </li>
        ))}
        {[...side.picks, ...(side.faab ? [`$${side.faab} FAAB`] : [])].map((x) => (
          <li key={x} className="text-slate-300">
            {x}
          </li>
        ))}
      </ul>
      {side.flips.map((f) => (
        <p key={f.week} className={`text-xs font-medium ${f.won ? 'text-emerald-400' : 'text-rose-300'}`}>
          Week {f.week}: {f.won ? `beat ${f.opponent} because of this trade` : `lost to ${f.opponent} because of this trade`}
        </p>
      ))}
      {!final && <p className="text-xs text-slate-400">{signedPts(side.projectedGain)} lineup points projected rest of season</p>}
    </div>
  );
}

function Trade({ t }: { t: TradeReport }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Week {t.week}
        {t.final && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200">Final</span>}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {t.sides.map((s, i) => (
          <Side key={s.teamName} side={s} winner={i === 0 && t.margin >= 10} final={t.final} />
        ))}
      </div>
      <p className="text-sm text-slate-300">{t.verdict}</p>
      {t.roast && <p className="rounded-md bg-rose-950/70 px-3 py-2 text-sm font-medium text-rose-200 ring-1 ring-rose-800">🔥 {t.roast}</p>}
    </li>
  );
}

// Every trade in the league this season, scored by what it did for each team's lineups.
export function TradesPanel({ leagueKey }: { leagueKey: string }) {
  const { data, error, isPending } = useTrades(leagueKey);
  let body;
  if (isPending) body = <p className="text-sm text-slate-400">Loading trades…</p>;
  else if (error) body = <p role="alert" className="text-sm text-rose-300">Couldn't load trades: {error.message}</p>;
  else if (!data.supported) body = <p className="text-sm text-slate-400">Trades can only be read from Sleeper and Yahoo leagues for now.</p>;
  else if (data.trades.length === 0) body = <p className="text-sm text-slate-400">No trades in this league yet.</p>;
  else
    body = (
      <ul className="divide-y divide-slate-800">
        {data.trades.map((t) => (
          <Trade key={t.id} t={t} />
        ))}
      </ul>
    );

  return (
    <section aria-label="Trades" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">Trades</h3>
      {body}
      <p className="text-xs text-slate-400">
        Scored by each team's lineups with the trade, against the ones it would have had without it: the same starters, with the players it gave up
        starting wherever that week's projections favored them. A game is flipped when it would have gone the other way.
      </p>
    </section>
  );
}
