import type { LeagueHistory, LeagueOutlook, RecapSeasonLeague } from '@ffd/shared';
import { percent } from '../outlook/UpNext';
import { useId } from 'react';
import { PLATFORM_LABEL } from '../../format';
import { ResultChip } from './ResultChip';
import { WeeklyChart } from './WeeklyChart';
import { WeeklyTable } from './WeeklyTable';

export type HistoryMode = 'chart' | 'table';

// Which finished week the recap below shows, and which weeks it can show.
export interface RecapWeeks {
  week: number;
  weeks: number[];
}

export function LeagueHistoryCard({
  history,
  mode,
  onMode,
  season,
  outlook,
  recap,
  onPickWeek,
}: {
  outlook?: LeagueOutlook | null;
  history: LeagueHistory;
  mode: HistoryMode;
  onMode: (m: HistoryMode) => void;
  season: RecapSeasonLeague | null;
  recap: RecapWeeks | null;
  onPickWeek: (week: number) => void;
}) {
  const { name, platform, weeks, record, avgPoints } = history;
  const finished = record.wins + record.losses + record.ties;
  const headingId = useId();

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-4 rounded-xl border p-5 shadow-sm border-slate-800 bg-slate-900">
      <header className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="truncate text-lg font-semibold">
          {name}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-slate-400">{PLATFORM_LABEL[platform]}</span>
          <div className="flex gap-1" role="group" aria-label="View">
            {(['chart', 'table'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={`rounded-md px-2.5 py-1 text-sm font-medium capitalize ${mode === m ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-xs text-slate-400">Record</div>
          {/* Big standalone numbers use proportional figures, not tabular-nums. */}
          <div className="text-2xl font-semibold">
            {finished ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Avg points / week</div>
          <div className="text-2xl font-semibold">{avgPoints != null ? avgPoints.toFixed(1) : '—'}</div>
        </div>
        {outlook?.playoffChance != null && (
          <div title={`Chance of finishing in the top ${outlook.playoffTeams} of ${outlook.teams}, from simulating the rest of the regular season`}>
            <div className="text-xs text-slate-400">Playoff chance</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{percent(outlook.playoffChance)}</span>
              {outlook.projectedWins != null && <span className="text-xs text-slate-400">~{outlook.projectedWins.toFixed(1)} wins</span>}
            </div>
          </div>
        )}
        {season && season.weeks.length > 0 && (
          <div>
            <div className="text-xs text-slate-400">Losses a better lineup wins</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-semibold ${season.winnable.length ? 'text-amber-300' : ''}`}>{season.winnable.length}</span>
              {season.winnable.map((w) => (
                <button key={w} type="button" onClick={() => onPickWeek(w)} className="text-xs font-medium text-slate-300 underline decoration-slate-600 hover:text-slate-100" aria-label={`Show the week ${w} recap`}>
                  Wk {w}
                </button>
              ))}
              <span className="text-xs text-slate-400">· {season.leftOnBench.toFixed(1)} pts left on the bench</span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1" aria-label="Weekly results">
          {weeks.map((w) => (
            <ResultChip key={w.week} result={w.result} week={w.week} />
          ))}
        </div>
      </div>

      {mode === 'chart' ? (
        <>
          <WeeklyChart weeks={weeks} label={name} recap={recap} winnable={season?.winnable ?? []} onPickWeek={onPickWeek} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
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
            {recap && <li className="text-slate-400 sm:ml-auto">Click a week to see its lineup recap</li>}
          </ul>
        </>
      ) : (
        <WeeklyTable weeks={weeks} recap={recap} winnable={season?.winnable ?? []} onPickWeek={onPickWeek} />
      )}
    </article>
  );
}
