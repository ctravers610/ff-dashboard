import { lazy, Suspense, useState, type ComponentType, type SVGProps } from 'react';
import { signOut, useDashboard, type Me } from './api';
import { AlertList } from './components/AlertList';
import { Hero } from './components/Hero';
import { ChartIcon, FootballIcon, RefreshIcon, ScoreboardIcon, SwapIcon, UsersIcon } from './components/icons';
import { ManualLeagueEditor } from './components/ManualLeagueEditor';
import { MatchupTable } from './components/MatchupTable';
import { PlayersView } from './components/PlayersView';
import { WaiversView } from './components/waivers/WaiversView';
import { YahooConnect } from './components/YahooConnect';

// The History tab pulls in the charting library, so load it only when it's opened.
const HistoryView = lazy(() =>
  import('./components/history/HistoryView').then((m) => ({ default: m.HistoryView })),
);

type View = 'matchups' | 'waivers' | 'players' | 'history';
const VIEWS: { id: View; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'matchups', label: 'Matchups', Icon: ScoreboardIcon },
  { id: 'waivers', label: 'Waivers', Icon: SwapIcon },
  { id: 'players', label: 'Players', Icon: UsersIcon },
  { id: 'history', label: 'History', Icon: ChartIcon },
];

export default function App({ user }: { user: Me['user'] }) {
  const { data, error, isPending, isFetching, refetch } = useDashboard();
  // Reminder notifications open /?view=waivers, so honor a view in the address.
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return VIEWS.some((v) => v.id === requested) ? (requested as View) : 'matchups';
  });
  const [editing, setEditing] = useState<string | null>(null); // 'new' or a manual league id

  return (
    // Bottom padding on phones leaves room for the tab bar.
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pb-10 sm:pt-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <FootballIcon className="text-xl text-emerald-400" />
          Fantasy Dashboard
        </h1>

        {/* One nav: a bottom tab bar on phones, tabs in the header from sm up. */}
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] sm:static sm:ml-auto sm:justify-end sm:gap-1 sm:border-0 sm:bg-transparent sm:pb-0"
        >
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={view === id ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium sm:flex-none sm:flex-row sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-sm ${
                view === id ? 'text-emerald-400 sm:bg-slate-800 sm:text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="text-lg sm:text-base" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={isFetching ? 'Refreshing' : 'Refresh'}
            title="Refresh"
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshIcon className={`text-lg ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          {user && (
            <div className="flex items-center gap-2 text-sm">
              {user.avatarUrl && <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />}
              <span className="hidden text-slate-400 md:inline">{user.login}</span>
              <button type="button" onClick={() => void signOut()} className="rounded-lg px-2 py-1.5 font-medium text-slate-300 hover:bg-slate-800">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <YahooConnect />

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-rose-950/60 p-4 text-sm text-rose-200">
          Couldn't load the dashboard: {error.message}. Is the API running?
        </div>
      )}

      {data?.errors.map((e) => (
        <div key={e.source} className="mb-3 rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200">
          <span className="font-medium">{e.source}:</span> {e.message}
        </div>
      ))}

      {isPending && <p className="text-slate-400">Loading your leagues…</p>}

      {view === 'matchups' ? (
        data && (
          <main>
            {data.leagues.length > 0 && <Hero data={data} />}
            <AlertList leagues={data.leagues} />
            {data.leagues.length > 0 && <MatchupTable leagues={data.leagues} onEdit={setEditing} />}
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="mt-3 w-full rounded-xl border border-dashed border-slate-700 py-3 text-sm font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              + Add FFPC league (manual roster)
            </button>
          </main>
        )
      ) : view === 'waivers' ? (
        <main>
          <WaiversView />
        </main>
      ) : view === 'players' ? (
        data && (
          <main>
            <PlayersView players={data.players} />
          </main>
        )
      ) : (
        <main>
          <Suspense fallback={<p className="text-slate-400">Loading history…</p>}>
            <HistoryView />
          </Suspense>
        </main>
      )}

      {editing && <ManualLeagueEditor leagueId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
