import type { AllPlay } from '@ffd/shared';
import { ordinal, pts } from '../format';

// Headline for an all-play week: where you rank against the win line.
export function AllPlaySummary({ allPlay }: { allPlay: AllPlay }) {
  const { teams, winSlots, myRank, myProjectedRank } = allPlay;
  const me = teams[myRank - 1]!;
  const winning = myRank <= winSlots;
  // Cushion over the first team outside the win line, or gap to the last team inside it.
  const line = winning ? teams[winSlots] : teams[winSlots - 1];
  const gap = line ? me.points - line.points : null;

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800/60">
      <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
        All-play week · top {winSlots} of {teams.length} win
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div
          className={`text-2xl font-semibold ${winning ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          {ordinal(myRank)} <span className="text-base font-normal text-slate-500">of {teams.length}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{pts(me.points)}</div>
          {me.projected != null && (
            <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">proj {pts(me.projected)}</div>
          )}
        </div>
      </div>
      <div className="text-xs text-slate-600 dark:text-slate-300">
        {gap != null && (winning ? `${pts(gap)} pts above the win line` : `${pts(-gap)} pts below the win line`)}
        {myProjectedRank != null && (
          <span className={myProjectedRank <= winSlots ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
            {' '}
            · projected to finish {ordinal(myProjectedRank)}
          </span>
        )}
      </div>
    </div>
  );
}

// Full league scoreboard with the win line drawn after the last winning spot.
export function AllPlayTable({ allPlay }: { allPlay: AllPlay }) {
  return (
    <div className="text-sm">
      <table className="w-full">
        <thead className="text-xs text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-1 text-left font-medium">#</th>
            <th className="py-1 text-left font-medium">Team</th>
            <th className="py-1 text-right font-medium">Pts</th>
            <th className="py-1 text-right font-medium">Proj</th>
          </tr>
        </thead>
        <tbody>
          {allPlay.teams.map((t, i) => (
            <tr
              key={t.teamName}
              className={`${t.isMe ? 'bg-sky-50 font-semibold dark:bg-sky-950/50' : ''} ${
                i === allPlay.winSlots - 1 ? 'border-b-2 border-dashed border-emerald-500' : ''
              }`}
            >
              <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
              <td className="max-w-0 truncate py-1 pr-2">
                {t.teamName}
                {t.live && <span className="ml-1 text-[10px] font-medium uppercase text-emerald-600">live</span>}
              </td>
              <td className="py-1 text-right tabular-nums">{pts(t.points)}</td>
              <td className="py-1 pl-2 text-right tabular-nums text-slate-500">{t.projected != null ? pts(t.projected) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Teams above the dashed line win the week. Teams not marked live show their score from your last Live Scoring paste.
      </p>
    </div>
  );
}
