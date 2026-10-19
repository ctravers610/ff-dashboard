import type { HistoryWeek } from '@ffd/shared';
import { ordinal, pts } from '../../format';
import { ResultChip } from './ResultChip';

// The accessible twin of the chart: every value, no hover needed.
export function WeeklyTable({ weeks }: { weeks: HistoryWeek[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-slate-600 dark:text-slate-400">
        <tr>
          <th className="py-1 text-left font-medium">Week</th>
          <th className="py-1 text-left font-medium">Result</th>
          <th className="py-1 text-right font-medium">You</th>
          <th className="py-1 pl-3 text-left font-medium">Opponent</th>
          <th className="py-1 text-right font-medium">Pts</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {weeks.map((w) => (
          <tr key={w.week}>
            <td className="py-1.5 tabular-nums">{w.week}</td>
            <td className="py-1.5">
              <ResultChip result={w.result} week={w.week} />
            </td>
            <td className="py-1.5 text-right tabular-nums">{pts(w.points)}</td>
            {w.allPlay ? (
              <td className="py-1.5 pl-3 text-slate-600 dark:text-slate-400" colSpan={2}>
                All-play: {ordinal(w.allPlay.rank)} of {w.allPlay.teams} (top {w.allPlay.winSlots} win)
              </td>
            ) : (
              <>
                <td className="max-w-0 truncate py-1.5 pl-3 text-slate-600 dark:text-slate-400">{w.opponentName ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{w.opponentPoints != null ? pts(w.opponentPoints) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
