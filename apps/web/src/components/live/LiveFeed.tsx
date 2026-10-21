import type { LiveEvent, LiveEventLeague } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, useDemo, useLive } from '../../api';

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

// The live scoring feed, as a column beside the matchups: newest first,
// filterable, and checked every 30 seconds by the server while games are on.
export function LiveFeed() {
  const { data, error, isPending } = useLive();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const demo = useDemo();
  const check = useMutation({
    mutationFn: () => api('/api/live/poll', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live'] }),
  });

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of data?.events ?? []) for (const l of e.leagues) seen.set(l.leagueKey, l.leagueName);
    return [...seen.entries()];
  }, [data]);

  const events = (data?.events ?? []).filter((e) =>
    filter === 'all' ? true : filter === 'mine' ? e.leagues.some((l) => l.role === 'starter') : e.leagues.some((l) => l.leagueKey === filter),
  );

  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 id="live-title" className="flex items-center gap-2 font-semibold">
          {data?.live && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
          Live scoring
        </h2>
        {!demo && (
        <button
          type="button"
          onClick={() => check.mutate()}
          disabled={check.isPending}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          {check.isPending ? 'Checking…' : 'Check now'}
        </button>
        )}
      </header>

      {isPending ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-rose-300">Couldn't load the live feed: {error.message}</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {data.live
              ? `Week ${data.week} games are on: checking every 30 seconds${data.lastCheckedAt ? ` (last ${ago(data.lastCheckedAt)})` : ''}.`
              : `No week ${data.week} games are on right now. The feed fills in while games are played.`}
          </p>

          {leagues.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              Show
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
                <option value="all">Everything</option>
                <option value="mine">My starters</option>
                {leagues.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{data.events.length === 0 ? 'No scoring yet this week.' : 'Nothing for this filter yet.'}</p>
          ) : (
            <ol className="divide-y divide-slate-800">
              {events.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ol>
          )}
          <p className="text-xs text-slate-400">Scored by each league's own rules. Green counts for you, red against you, gray is your bench.</p>
        </>
      )}
    </section>
  );
}
