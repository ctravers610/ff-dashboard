import type { Matchup } from '@ffd/shared';
import { pts } from '../format';

function Projection({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  return <div className="text-xs text-slate-600 tabular-nums dark:text-slate-400">proj {pts(value)}</div>;
}

export function Scoreboard({ matchup }: { matchup: Matchup }) {
  const { me, opponent } = matchup;
  const winning = opponent ? me.points >= opponent.points : true;
  const margin = opponent && me.projected != null && opponent.projected != null ? me.projected - opponent.projected : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800/60">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-slate-600 dark:text-slate-400">{me.teamName}</div>
          <div
            className={`text-2xl font-semibold tabular-nums ${
              winning ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {pts(me.points)}
          </div>
          <Projection value={me.projected} />
        </div>
        <div className="text-xs font-medium uppercase text-slate-600 dark:text-slate-400">vs</div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm text-slate-600 dark:text-slate-400">{opponent?.teamName ?? 'Bye'}</div>
          <div className="text-2xl font-semibold tabular-nums">{opponent ? pts(opponent.points) : '—'}</div>
          <Projection value={opponent?.projected} />
        </div>
      </div>
      {margin != null && (
        <div
          className={`text-center text-xs font-medium ${
            margin >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          }`}
        >
          {margin >= 0 ? `Projected to win by ${pts(margin)}` : `Projected to lose by ${pts(-margin)}`}
        </div>
      )}
    </div>
  );
}
