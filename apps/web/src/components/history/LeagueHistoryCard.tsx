import type { LeagueHistory } from '@ffd/shared';
import { PLATFORM_LABEL } from '../../format';
import { ResultChip } from './ResultChip';
import { WeeklyChart } from './WeeklyChart';
import { WeeklyTable } from './WeeklyTable';

export type HistoryMode = 'chart' | 'table';

export function LeagueHistoryCard({ history, mode }: { history: LeagueHistory; mode: HistoryMode }) {
  const { name, platform, weeks, record, avgPoints } = history;
  const finished = record.wins + record.losses + record.ties;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-3">
        <h2 className="truncate text-lg font-semibold">{name}</h2>
        <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {PLATFORM_LABEL[platform]}
        </span>
      </header>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-xs text-slate-600 dark:text-slate-400">Record</div>
          {/* Big standalone numbers use proportional figures, not tabular-nums. */}
          <div className="text-2xl font-semibold">
            {finished ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600 dark:text-slate-400">Avg points / week</div>
          <div className="text-2xl font-semibold">{avgPoints != null ? avgPoints.toFixed(1) : '—'}</div>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Weekly results">
          {weeks.map((w) => (
            <ResultChip key={w.week} result={w.result} week={w.week} />
          ))}
        </div>
      </div>

      {mode === 'chart' ? (
        <>
          <WeeklyChart weeks={weeks} label={name} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-series)' }} />
              Your points
            </li>
            {weeks.some((w) => !w.allPlay && w.opponentPoints != null) && (
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 rounded" style={{ background: 'var(--chart-ink)' }} />
                Opponent
              </li>
            )}
            {weeks.some((w) => w.result === 'live') && (
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm opacity-50" style={{ background: 'var(--chart-series)' }} />
                Week in progress
              </li>
            )}
          </ul>
        </>
      ) : (
        <WeeklyTable weeks={weeks} />
      )}
    </article>
  );
}
