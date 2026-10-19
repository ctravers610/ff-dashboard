import { useState } from 'react';
import { useDashboard } from './api';
import { LeagueCard } from './components/LeagueCard';
import { ManualLeagueEditor } from './components/ManualLeagueEditor';
import { PlayersView } from './components/PlayersView';
import { YahooConnect } from './components/YahooConnect';
import { matchupStatus } from './format';

export default function App() {
  const { data, error, isPending, isFetching, refetch } = useDashboard();
  const [view, setView] = useState<'leagues' | 'players'>('leagues');
  const [editing, setEditing] = useState<string | null>(null); // 'new' or a manual league id

  const totals = data?.leagues.reduce(
    (acc, l) => {
      const me = l.standings.find((t) => t.teamId === l.myTeamId);
      const status = matchupStatus(l.matchup);
      return {
        wins: acc.wins + (me?.wins ?? 0),
        losses: acc.losses + (me?.losses ?? 0),
        matchups: acc.matchups + (status.leading != null ? 1 : 0),
        leadingNow: acc.leadingNow + (status.leading ? 1 : 0),
        projectedWins: acc.projectedWins + (status.projectedWin ? 1 : 0),
        alerts: acc.alerts + l.alerts.length,
      };
    },
    { wins: 0, losses: 0, matchups: 0, leadingNow: 0, projectedWins: 0, alerts: 0 },
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fantasy Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data ? `${data.season} season · Week ${data.week}` : 'Loading…'}
            {data && ` · updated ${new Date(data.updatedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <YahooConnect />

      {error && (
        <div className="mb-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          Couldn't load the dashboard: {error.message}. Is the API running?
        </div>
      )}

      {data?.errors.map((e) => (
        <div
          key={e.source}
          className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <span className="font-medium">{e.source}:</span> {e.message}
        </div>
      ))}

      {totals && data && data.leagues.length > 0 && (
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Combined record', `${totals.wins}-${totals.losses}`],
            ['Winning right now', `${totals.leadingNow} of ${totals.matchups}`],
            ['Projected to win', `${totals.projectedWins} of ${totals.matchups}`],
            ['Lineup alerts', totals.alerts],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </section>
      )}

      {isPending && <p className="text-slate-500">Loading your leagues…</p>}

      {data && data.leagues.length > 0 && (
        <nav className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
          {(['leagues', 'players'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                view === v
                  ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {v}
            </button>
          ))}
        </nav>
      )}

      {view === 'leagues' ? (
        <main className="grid gap-5 lg:grid-cols-2">
          {data?.leagues.map((l) => (
            <LeagueCard
              key={`${l.platform}:${l.leagueId}`}
              league={l}
              onEdit={l.manual ? () => setEditing(l.leagueId) : undefined}
            />
          ))}
          {data && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex min-h-32 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:border-slate-500 dark:hover:text-slate-300"
            >
              + Add FFPC league (manual roster)
            </button>
          )}
        </main>
      ) : (
        data && <PlayersView players={data.players} />
      )}

      {editing && (
        <ManualLeagueEditor leagueId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
