import { useState } from 'react';
import { useHistory } from '../../api';
import { LeagueHistoryCard, type HistoryMode } from './LeagueHistoryCard';

export function HistoryView() {
  const { data, error, isPending, isFetching } = useHistory();
  const [mode, setMode] = useState<HistoryMode>('chart');

  if (isPending) return <p className="text-slate-400">Loading history…</p>;
  if (error) return <p className="text-rose-600">Couldn't load history: {error.message}</p>;
  if (data.leagues.length === 0) {
    return (
      <p className="text-slate-400">
        No history yet. Weeks are recorded each time the dashboard loads, so check back after a few games.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* One control row above the cards; it scopes every card below. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {data.season} season · results are head-to-head against your opponent each week
        </p>
        <div className="flex gap-1" role="group" aria-label="View">
          {(['chart', 'table'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
                mode === m
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Refetching keeps the previous render, just dimmed: no skeleton, no layout jump. */}
      <div className={`grid gap-5 transition-opacity lg:grid-cols-2 ${isFetching ? 'opacity-70' : ''}`}>
        {data.leagues.map((h) => (
          <LeagueHistoryCard key={`${h.platform}:${h.leagueId}`} history={h} mode={mode} />
        ))}
      </div>
    </section>
  );
}
