import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type ComponentType, type SVGProps } from 'react';
import { signOut, useDashboard, useDemo, useWaivers, type Me } from './api';
import { AddLeagueDialog } from './components/AddLeagueDialog';
import { Hero } from './components/Hero';
import { ChartIcon, FootballIcon, RefreshIcon, ScoreboardIcon, SwapIcon, UsersIcon } from './components/icons';
import { LiveFeed } from './components/live/LiveFeed';
import { ManualLeagueEditor } from './components/ManualLeagueEditor';
import { MatchupTable } from './components/MatchupTable';
import { PlayersView } from './components/PlayersView';
import { SourceErrors } from './components/SourceErrors';
import { DataStatus } from './components/DataStatus';
import { WaiversView } from './components/waivers/WaiversView';
import { YahooConnect } from './components/YahooConnect';
import { useShortcut } from './shortcuts';

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
  const { data, error, isPending } = useDashboard();
  const demo = useDemo();
  // Refresh reloads everything on screen (dashboard, waivers, history, ...), not just the matchups.
  const queryClient = useQueryClient();
  // Spins only for a refresh you asked for, not for the background polling.
  const [isFetching, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries().finally(() => setRefreshing(false));
  };
  // Loaded on every tab, so the Waivers button can flag leagues whose reminder has come.
  const needClaims = useWaivers().data?.leagues.filter((l) => l.claims?.reminderDue).length ?? 0;
  // Reminder notifications open /?view=waivers, so honor a view in the address.
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return VIEWS.some((v) => v.id === requested) ? (requested as View) : 'matchups';
  });
  const [editing, setEditing] = useState<string | null>(null); // 'new' or a manual league id
  const [adding, setAdding] = useState(false);
  // 1-4 switch tabs, in the order they're shown.
  useShortcut((key) => {
    const target = VIEWS[Number(key) - 1];
    if (!target) return false;
    setView(target.id);
    return true;
  });

  return (
    // Bottom padding on phones leaves room for the tab bar.
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:pb-10 sm:pt-6">
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
              <span className={`relative ${id === 'waivers' && needClaims > 0 ? 'sm:mr-1.5' : ''}`}>
                <Icon className="text-lg sm:text-base" />
                {id === 'waivers' && needClaims > 0 && (
                  <span aria-hidden="true" className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {needClaims}
                  </span>
                )}
              </span>
              {label}
              {id === 'waivers' && needClaims > 0 && (
                <span className="sr-only">
                  ({needClaims} league{needClaims > 1 ? 's' : ''} need{needClaims > 1 ? '' : 's'} your claims)
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
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

      {demo ? (
        <p role="note" className="mb-4 rounded-lg border border-violet-800 bg-violet-950/50 px-4 py-2.5 text-sm text-violet-100">
          <span className="font-semibold">Demo:</span> made-up leagues on Sleeper, ESPN and FFPC, frozen in week 6 of a season. Look around: everything
          works except changing things.
        </p>
      ) : (
        <YahooConnect />
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-rose-950/60 p-4 text-sm text-rose-200">
          Couldn't load the dashboard: {error.message}. Is the API running?
        </div>
      )}

      {/* The Waivers and History tabs report their own data problems. */}
      {(view === 'matchups' || view === 'players') && data && <SourceErrors errors={data.errors} className="mb-3" />}

      {isPending && <p className="text-slate-400">Loading your leagues…</p>}

      {view === 'matchups' ? (
        data && (
          // The live feed on the left, matchups on the right; stacked on a phone,
          // matchups first (they come first in the page, too).
          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
            <main className="lg:order-2">
              {data.leagues.length > 0 && <Hero data={data} />}
              {data.leagues.length > 0 && <MatchupTable leagues={data.leagues} onEdit={demo ? undefined : setEditing} />}
              <DataStatus data={data} />
              {!demo && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 w-full rounded-xl border border-dashed border-slate-700 py-3 text-sm font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
              >
                + Add league
              </button>
              )}
            </main>
            {/* Stays in view while the matchups scroll, and scrolls on its own. */}
            <aside className="lg:sticky lg:top-4 lg:order-1 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              <LiveFeed />
            </aside>
          </div>
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

      {adding && (
        <AddLeagueDialog
          onClose={() => setAdding(false)}
          onFfpc={() => {
            setAdding(false);
            setEditing('new'); // FFPC has its own paste-based editor
          }}
          onEditFfpc={(id) => {
            setAdding(false);
            setEditing(id);
          }}
        />
      )}
      {/* Required by the Yahoo Fantasy API agreement wherever its data is shown: here, the whole app. */}
      {data?.leagues.some((l) => l.platform === 'yahoo') && (
        <p className="mt-8 text-center text-xs text-slate-400">
          Fantasy data provided by{' '}
          <a href="https://football.fantasysports.yahoo.com/" target="_blank" rel="noreferrer" className="font-medium text-slate-300 underline hover:text-slate-100">
            Yahoo Fantasy
          </a>
        </p>
      )}
      <p className="mt-8 hidden text-center text-xs text-slate-400 lg:block">
        Shortcuts: <kbd className="font-sans font-semibold text-slate-300">1</kbd>–<kbd className="font-sans font-semibold text-slate-300">4</kbd> switch tabs ·{' '}
        <kbd className="font-sans font-semibold text-slate-300">j</kbd> / <kbd className="font-sans font-semibold text-slate-300">k</kbd> next / previous league ·
        arrow keys move through a league list
      </p>
      {editing && <ManualLeagueEditor leagueId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
