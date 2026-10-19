import type { Matchup } from '@ffd/shared';
import { pts } from '../format';

export function Scoreboard({ matchup }: { matchup: Matchup }) {
  const { me, opponent } = matchup;
  const winning = opponent ? me.points >= opponent.points : true;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800/60">
      <div className="min-w-0">
        <div className="truncate text-sm text-slate-500 dark:text-slate-400">{me.teamName}</div>
        <div
          className={`text-2xl font-semibold tabular-nums ${
            winning ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {pts(me.points)}
        </div>
      </div>
      <div className="text-xs font-medium uppercase text-slate-400">vs</div>
      <div className="min-w-0 text-right">
        <div className="truncate text-sm text-slate-500 dark:text-slate-400">
          {opponent?.teamName ?? 'Bye'}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{opponent ? pts(opponent.points) : '—'}</div>
      </div>
    </div>
  );
}
