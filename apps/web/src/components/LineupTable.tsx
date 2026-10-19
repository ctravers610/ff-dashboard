import type { Matchup, StarterSlot } from '@ffd/shared';
import { pts } from '../format';

function PlayerCell({ starter, align }: { starter: StarterSlot | undefined; align: 'left' | 'right' }) {
  const p = starter?.player;
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className={`truncate ${p ? '' : 'italic text-rose-500'}`}>{p?.name ?? 'Empty'}</div>
      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
        {p ? `${p.position} · ${p.nflTeam ?? 'FA'}` : ''}
        {p?.injuryStatus && <span className="ml-1 font-medium text-amber-600">{p.injuryStatus}</span>}
      </div>
    </div>
  );
}

// Side-by-side starters for both teams, one row per roster slot.
export function LineupTable({ matchup }: { matchup: Matchup }) {
  const mine = matchup.me.starters;
  const theirs = matchup.opponent?.starters ?? [];

  return (
    <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
      {mine.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_3rem_2.5rem_3rem_1fr] items-center gap-2 py-1.5">
          <PlayerCell starter={s} align="left" />
          <div className="text-right tabular-nums">{pts(s.points)}</div>
          <div className="text-center text-xs font-medium text-slate-400">{s.slot}</div>
          <div className="tabular-nums">{theirs[i] ? pts(theirs[i].points) : ''}</div>
          <PlayerCell starter={theirs[i]} align="right" />
        </div>
      ))}
    </div>
  );
}
