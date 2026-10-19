import type { Matchup, StarterSlot } from '@ffd/shared';
import { pts } from '../format';

function PlayerCell({ starter, align }: { starter: StarterSlot | undefined; align: 'left' | 'right' }) {
  const p = starter?.player;
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className={`truncate ${p ? '' : 'italic text-rose-400'}`}>{p?.name ?? 'Empty'}</div>
      <div className="truncate text-xs text-slate-400">
        {p ? `${p.position} · ${p.nflTeam ?? 'FA'}` : ''}
        {p?.injuryStatus && <span className="ml-1 font-medium text-amber-400">{p.injuryStatus}</span>}
      </div>
    </div>
  );
}

function PointsCell({ starter, align }: { starter: StarterSlot | undefined; align: 'left' | 'right' }) {
  if (!starter) return <div />;
  return (
    <div className={`tabular-nums ${align === 'right' ? 'text-right' : ''}`}>
      <div>{pts(starter.points)}</div>
      {starter.projected != null && <div className="text-xs text-slate-400">{pts(starter.projected)}</div>}
    </div>
  );
}

// Side-by-side starters for both teams, one row per roster slot.
export function LineupTable({ matchup }: { matchup: Matchup }) {
  const mine = matchup.me.starters;
  const theirs = matchup.opponent?.starters ?? [];

  const hasProjections = mine.some((s) => s.projected != null);

  return (
    <div className="divide-y text-sm divide-slate-800">
      {hasProjections && (
        <p className="pb-1.5 text-xs text-slate-400">Points, with live projection underneath.</p>
      )}
      {mine.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_3rem_2.5rem_3rem_1fr] items-center gap-2 py-1.5">
          <PlayerCell starter={s} align="left" />
          <PointsCell starter={s} align="right" />
          <div className="text-center text-xs font-medium text-slate-400">{s.slot}</div>
          <PointsCell starter={theirs[i]} align="left" />
          <PlayerCell starter={theirs[i]} align="right" />
        </div>
      ))}
    </div>
  );
}
