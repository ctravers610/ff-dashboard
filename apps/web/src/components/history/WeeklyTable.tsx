import type { HistoryWeek } from '@ffd/shared';
import { ordinal, pts } from '../../format';
import type { RecapWeeks } from './LeagueHistoryCard';
import { ResultChip } from './ResultChip';

// The accessible twin of the chart: every value, no hover needed. A finished
// week's number opens its lineup recap, like clicking its column in the chart.
export function WeeklyTable({
  weeks,
  recap,
  winnable,
  onPickWeek,
}: {
  weeks: HistoryWeek[];
  recap: RecapWeeks | null;
  winnable: number[];
  onPickWeek: (week: number) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-slate-400">
        <tr>
          <th className="py-1 text-left font-medium">Week</th>
          <th className="py-1 text-left font-medium">Result</th>
          <th className="py-1 text-right font-medium">You</th>
          <th className="py-1 pl-3 text-left font-medium">Opponent</th>
          <th className="py-1 text-right font-medium">Pts</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {weeks.map((w) => (
          <tr key={w.week}>
            <td className="py-1.5 tabular-nums">
              {recap?.weeks.includes(w.week) ? (
                <button
                  type="button"
                  aria-pressed={recap.week === w.week}
                  aria-label={`Show the week ${w.week} recap`}
                  onClick={() => onPickWeek(w.week)}
                  className={`rounded px-1.5 font-medium ${recap.week === w.week ? 'bg-slate-100 text-slate-900' : 'underline decoration-slate-600 hover:bg-slate-800'}`}
                >
                  {w.week}
                </button>
              ) : (
                <span className="px-1.5">{w.week}</span>
              )}
            </td>
            <td className="py-1.5">
              <ResultChip result={w.result} week={w.week} />
              {winnable.includes(w.week) && <span className="ml-2 text-xs text-amber-300">winnable</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums">{pts(w.points)}</td>
            {w.allPlay ? (
              <td className="py-1.5 pl-3 text-slate-400" colSpan={2}>
                All-play: {ordinal(w.allPlay.rank)} of {w.allPlay.teams} (top {w.allPlay.winSlots} win)
              </td>
            ) : (
              <>
                <td className="max-w-0 truncate py-1.5 pl-3 text-slate-400">{w.opponentName ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{w.opponentPoints != null ? pts(w.opponentPoints) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
