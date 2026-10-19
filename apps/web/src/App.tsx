import { useDashboard } from './api';
import { LeagueCard } from './components/LeagueCard';
import { YahooConnect } from './components/YahooConnect';

export default function App() {
  const { data, error, isPending, isFetching, refetch } = useDashboard();

  const totals = data?.leagues.reduce(
    (acc, l) => {
      const me = l.standings.find((t) => t.teamId === l.myTeamId);
      const m = l.matchup;
      return {
        wins: acc.wins + (me?.wins ?? 0),
        losses: acc.losses + (me?.losses ?? 0),
        leadingNow: acc.leadingNow + (m?.opponent && m.me.points > m.opponent.points ? 1 : 0),
        alerts: acc.alerts + l.alerts.length,
      };
    },
    { wins: 0, losses: 0, leadingNow: 0, alerts: 0 },
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
            ['Leagues', data.leagues.length],
            ['Combined record', `${totals.wins}-${totals.losses}`],
            ['Leading this week', `${totals.leadingNow} of ${data.leagues.length}`],
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

      <main className="grid gap-5 lg:grid-cols-2">
        {data?.leagues.map((l) => <LeagueCard key={`${l.platform}:${l.leagueId}`} league={l} />)}
      </main>
    </div>
  );
}
