import type { LiveEvent, LiveEventLeague } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, useDemo, useLive } from '../../api';

// The day heading and the column layout make AM/PM noise.
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
const fullTime = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

const ago = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
};

// The same result in several leagues reads as one line.
interface PointsLine {
  key: string;
  names: string;
  role: LiveEventLeague['role'];
  points: number | null;
}

function pointsLines(leagues: LiveEventLeague[]): PointsLine[] {
  const lines = new Map<string, PointsLine>();
  for (const l of leagues) {
    const key = `${l.role}:${l.points}`;
    const line = lines.get(key);
    if (line) line.names += `, ${l.leagueName}`;
    else lines.set(key, { key, names: l.leagueName, role: l.role, points: l.points });
  }
  return [...lines.values()];
}

const pointsText = (points: number | null) => (points == null ? 'pending' : `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`);

// What a play does for you: a starter's points help, an opponent's hurt, and a
// negative flips either one. The bench and pending points do nothing yet.
const effect = ({ role, points }: PointsLine) => (role === 'bench' || !points ? 0 : role === 'starter' ? Math.sign(points) : -Math.sign(points));
const effectColor = (line: PointsLine) => ['text-rose-300', 'text-slate-400', 'text-emerald-300'][effect(line) + 1]!;
const roleNote = (role: PointsLine['role']) => (role === 'opponent' ? 'vs you' : role === 'bench' ? 'bench' : null);

// Spelled out for tooltips and screen readers, where a quiet row has no room.
const lineDetail = (line: PointsLine) => {
  const note = roleNote(line.role);
  return `${line.names}${note ? ` · ${note}` : ''}${line.points == null ? ': site hasn’t updated yet' : ''}`;
};

// The stats worth noticing mid-scroll, like the "1 rec TD" in "1 catch, 1 rec TD, 24 rec yds".
const BIG_STAT = /\bTDs?\b|\bINTs?\b|fumble|2-pt|safet|FGs? made/;
const QUIET_UNDER = 1; // worth fewer points than this everywhere: one quiet line

export function EventRow({ e }: { e: LiveEvent }) {
  const lines = pointsLines(e.leagues);
  const bigStat = BIG_STAT.test(e.description);
  const time = (
    <time dateTime={e.at} title={fullTime(e.at)} className="pt-0.5 text-xs tabular-nums text-slate-400">
      {clock(e.at)}
    </time>
  );

  if (!bigStat && lines.every((l) => Math.abs(l.points ?? 0) < QUIET_UNDER)) {
    return (
      <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-1.5">
        {time}
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="min-w-0 text-xs text-slate-400">
            <span className="text-sm text-slate-300">{e.player.name}</span> {e.description}
          </p>
          <ul aria-label="Points by league" className="flex shrink-0 gap-2 text-xs tabular-nums">
            {lines.map((l) => (
              <li key={l.key} title={lineDetail(l)} className={effectColor(l)}>
                <span className="sr-only">{lineDetail(l)}: </span>
                {pointsText(l.points)}
              </li>
            ))}
          </ul>
        </div>
      </li>
    );
  }

  // A scoring play you have a stake in is tinted by which way it went.
  const effects = new Set(lines.map(effect).filter((n) => n !== 0));
  const tint = !bigStat || effects.size !== 1 ? '' : effects.has(1) ? 'bg-emerald-950/50' : 'bg-rose-950/50';
  return (
    <li className={`-mx-2 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 rounded-md px-2 py-2.5 ${tint}`}>
      {time}
      <div className="min-w-0">
        <p>
          <span className="font-medium">{e.player.name}</span>{' '}
          <span className="text-xs text-slate-400">
            {e.player.position} · {e.player.nflTeam ?? 'FA'}
          </span>
        </p>
        <p className="text-sm text-slate-300">
          {e.description.split(', ').map((stat, i) => (
            <span key={i} className={BIG_STAT.test(stat) ? 'font-semibold text-white' : undefined}>
              {i > 0 && ', '}
              {stat}
            </span>
          ))}
        </p>
        <ul aria-label="Points by league" className="mt-1 flex flex-col gap-0.5">
          {lines.map((l) => (
            <li key={l.key} className="flex items-baseline gap-1 text-xs text-slate-400">
              <span title={l.names} className="min-w-0 truncate">
                {l.names}
              </span>{' '}
              {roleNote(l.role) && <span className="shrink-0">· {roleNote(l.role)}</span>}{' '}
              <span title={l.points == null ? 'Site hasn’t updated yet' : undefined} className={`ml-auto shrink-0 pl-2 tabular-nums ${l.points == null ? '' : 'text-sm font-semibold'} ${effectColor(l)}`}>
                {pointsText(l.points)}
              </span>
            </li>
          ))}
        </ul>
      </div>
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

  // A filter also narrows each play to the leagues it asked for.
  const keep = (l: LiveEventLeague) => (filter === 'all' ? true : filter === 'mine' ? l.role === 'starter' : l.leagueKey === filter);
  const events = (data?.events ?? []).map((e) => ({ ...e, leagues: e.leagues.filter(keep) })).filter((e) => e.leagues.length > 0);

  // A week's feed runs Thursday to Monday, so a clock time alone is ambiguous.
  const days: { day: string; events: LiveEvent[] }[] = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last?.day === day(e.at)) last.events.push(e);
    else days.push({ day: day(e.at), events: [e] });
  }

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
              ? `Week ${data.week} · checking every 30 seconds${data.lastCheckedAt ? ` · last ${ago(data.lastCheckedAt)}` : ''}`
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

          {data.events.length > 0 && (
            <p className="flex gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-300" /> Helps you
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rose-300" /> Hurts you
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-400" /> No effect
              </span>
            </p>
          )}

          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{data.events.length === 0 ? 'No scoring yet this week.' : 'Nothing for this filter yet.'}</p>
          ) : (
            days.map((d) => (
              <div key={d.day}>
                <h3 className="sticky top-0 z-10 bg-slate-900 py-1 text-xs font-semibold text-slate-300">{d.day}</h3>
                <ol className="divide-y divide-slate-800">
                  {d.events.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                </ol>
              </div>
            ))
          )}
          <p className="text-xs text-slate-400">Scored by each league's own rules. Pending means that league's site hasn't updated yet.</p>
        </>
      )}
    </section>
  );
}
