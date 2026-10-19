import type { LiveEvent, LiveEventLeague } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, useLive } from '../../api';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const ago = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
};

// What a scoring play means in one league: good for you if he's your starter,
// bad if he's starting against you, nothing if he's on your bench.
function LeagueChip({ l }: { l: LiveEventLeague }) {
  const pts = l.points == null ? null : `${l.points > 0 ? '+' : ''}${l.points.toFixed(1)}`;
  const style =
    l.role === 'starter'
      ? 'bg-emerald-950 text-emerald-200 ring-emerald-800'
      : l.role === 'opponent'
        ? 'bg-rose-950/70 text-rose-200 ring-rose-800'
        : 'bg-slate-800 text-slate-300 ring-slate-700';
  const note = l.role === 'opponent' ? 'vs you' : l.role === 'bench' ? 'bench' : null;
  return (
    <li className={`rounded-md px-2 py-0.5 text-xs ring-1 ${style}`}>
      <span className="font-semibold tabular-nums">{pts ?? 'ESPN catching up'}</span> {l.leagueName}
      {note && <span className="opacity-80"> · {note}</span>}
    </li>
  );
}

export function EventRow({ e }: { e: LiveEvent }) {
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0">
          <span className="font-medium">{e.player.name}</span>{' '}
          <span className="text-sm text-slate-400">
            {e.player.position} · {e.player.nflTeam ?? 'FA'}
          </span>{' '}
          <span className="text-sm text-slate-200">{e.description}</span>
        </p>
        <time dateTime={e.at} className="shrink-0 text-xs text-slate-400">
          {time(e.at)}
        </time>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Points by league">
        {e.leagues.map((l) => (
          <LeagueChip key={l.leagueKey} l={l} />
        ))}
      </ul>
    </li>
  );
}

type Filter = 'all' | 'mine' | string; // a league key

export function LiveFeed() {
  const { data, error, isPending } = useLive();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const check = useMutation({
    mutationFn: () => api('/api/live/poll', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live'] }),
  });

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of data?.events ?? []) for (const l of e.leagues) seen.set(l.leagueKey, l.leagueName);
    return [...seen.entries()];
  }, [data]);

  if (isPending) return <p className="text-slate-400">Loading the live feed…</p>;
  if (error) return <p role="alert" className="rounded-lg bg-rose-950/60 p-4 text-sm text-rose-200">Couldn't load the live feed: {error.message}</p>;

  const events = data.events.filter((e) =>
    filter === 'all' ? true : filter === 'mine' ? e.leagues.some((l) => l.role === 'starter') : e.leagues.some((l) => l.leagueKey === filter),
  );

  return (
    <section aria-label="Live scoring" className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-300">
          {data.live ? (
            <>
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Week {data.week} games are on: checking every 30 seconds{data.lastCheckedAt && ` (last ${ago(data.lastCheckedAt)})`}.
            </>
          ) : (
            `No week ${data.week} games are on right now. The feed fills in while games are played.`
          )}
        </p>
        <button
          type="button"
          onClick={() => check.mutate()}
          disabled={check.isPending}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          {check.isPending ? 'Checking…' : 'Check now'}
        </button>
      </header>

      {leagues.length > 0 && (
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
          {[['all', 'Everything'], ['mine', 'My starters'], ...leagues].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value!)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${filter === value ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {data.events.length === 0 ? 'No scoring yet this week.' : 'Nothing for this filter yet.'}
        </p>
      ) : (
        <ol className="divide-y divide-slate-800">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ol>
      )}
      <p className="text-xs text-slate-400">
        Each change is scored by every league's own rules. Green counts for you, red counts against you, gray is on your bench.
      </p>
    </section>
  );
}

/** The latest few events, for the Matchups tab. */
export function LatestScoring({ onSeeAll }: { onSeeAll: () => void }) {
  const { data } = useLive();
  const latest = data?.events.slice(0, 3) ?? [];
  if (latest.length === 0) return null;
  return (
    <section aria-label="Latest scoring" className="mb-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-2">
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold text-slate-200">Latest scoring</h2>
        <button type="button" onClick={onSeeAll} className="text-sm text-slate-400 hover:text-slate-200">
          See all
        </button>
      </div>
      <ol className="divide-y divide-slate-800">
        {latest.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </ol>
    </section>
  );
}
