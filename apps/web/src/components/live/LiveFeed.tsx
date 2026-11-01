import { buildBoard, isBigStat, marginChange, RECENT_MINUTES, rowWhere, type BoardLine, type BoardRow, type LiveEventLeague } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, useDemo, useLive } from '../../api';

// A week's feed runs Thursday to Monday, so anything older than today says its day.
const clock = (iso: string) => {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  return at.toDateString() === new Date().toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
};
const fullTime = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const ago = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
};

const pointsText = (points: number) => `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`;
const tone = (points: number) => (points > 0 ? 'text-emerald-300' : points < 0 ? 'text-rose-300' : 'text-slate-400');

function LeagueLines({ lines }: { lines: BoardLine[] }) {
  return (
    <ul aria-label="Points by league" className="mb-2 flex flex-col gap-1 rounded-md bg-slate-800 px-2.5 py-2">
      {lines.map((l) => {
        const waiting = l.pending && l.points === 0;
        return (
          <li key={l.leagueKey} className="flex items-baseline gap-1 text-xs text-slate-300">
            <span className="min-w-0">{l.leagueName}</span> {l.role !== 'starter' && <span className="shrink-0">· {l.role === 'opponent' ? 'vs you' : 'bench'}</span>}{' '}
            <span title={l.pending ? 'Site hasn’t updated yet' : undefined} className={`ml-auto shrink-0 pl-2 tabular-nums ${waiting ? 'text-slate-400' : `font-semibold ${l.role === 'bench' ? 'text-slate-400' : tone(marginChange(l))}`}`}>
              {waiting ? 'pending' : pointsText(marginChange(l))}
              {l.pending && !waiting && ' + pending'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// A row reads the same anywhere on the board: who, what they did, where it landed,
// and what it did to your margin. Clicking it lists the leagues.
function PlayerRow({ row, tint = '' }: { row: BoardRow; tint?: string }) {
  const [open, setOpen] = useState(false);
  const net = row.net == null ? (row.benchOnly ? 'bench' : 'pending') : pointsText(row.net);
  return (
    <li className={tint}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-left">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">
            {row.player.name}{' '}
            <span className="text-xs font-normal text-slate-400">
              {row.player.position} · {row.player.nflTeam ?? 'FA'}
            </span>
          </span>
          <span className="text-sm text-slate-300">
            {row.stats.split(', ').map((stat, i) => (
              <span key={i} className={row.kind === 'scoring' && isBigStat(stat) ? 'font-semibold text-white' : undefined}>
                {i > 0 && ', '}
                {stat}
              </span>
            ))}
          </span>
          <span className="text-xs text-slate-400">
            <time dateTime={row.at} title={fullTime(row.at)} className="tabular-nums">
              {clock(row.at)}
            </time>{' '}
            · {rowWhere(row)}
          </span>
        </span>
        <span className={`tabular-nums ${row.net == null ? 'text-sm text-slate-400' : `text-lg font-bold ${tone(row.net)}`}`}>{net}</span>
      </button>
      {open && <LeagueLines lines={row.lines} />}
    </li>
  );
}

function CalledBackRow({ row }: { row: BoardRow }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <p className="min-w-0 text-xs text-slate-400">
        <span className="text-sm text-slate-300">{row.player.name}</span> <s>{row.stats}</s>
      </p>
      <span className="shrink-0 text-xs text-slate-400">called back</span>
    </li>
  );
}

// A scoring play you have a stake in is tinted by which way it went.
function scoringTint(row: BoardRow) {
  const ways = new Set(row.lines.filter((l) => l.role !== 'bench' && l.points !== 0).map((l) => Math.sign(marginChange(l))));
  if (row.kind !== 'scoring' || ways.size !== 1) return '';
  return `-mx-2 rounded-md px-2 ${ways.has(1) ? 'bg-emerald-950/50' : 'bg-rose-950/50'}`;
}

// Plays on your bench change nothing, so those players share a line under the rows that do.
function Runs({ rows }: { rows: BoardRow[] }) {
  const bench = rows.filter((r) => r.benchOnly);
  return (
    <>
      <ol className="divide-y divide-slate-800">
        {rows
          .filter((r) => !r.benchOnly)
          .map((r) => (
            <PlayerRow key={r.key} row={r} />
          ))}
      </ol>
      {bench.length > 0 && <p className="text-xs text-slate-400">On your bench, not counted: {bench.map((r) => `${r.player.name}, ${r.stats}`).join(' · ')}</p>}
    </>
  );
}

type Filter = 'all' | 'mine' | string; // a league key

// The live scoring feed, as a column beside the matchups: a board of who's doing
// what, filterable, and checked every 30 seconds by the server while games are on.
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
  const board = buildBoard(events, Date.now());

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

          {board.recentNet != null && (
            <p className="flex items-baseline justify-between gap-2 border-b border-slate-800 pb-2.5 text-sm text-slate-300">
              Last {RECENT_MINUTES} minutes
              <span className={`text-2xl font-bold tabular-nums ${tone(board.recentNet)}`}>{pointsText(board.recentNet)}</span>
            </p>
          )}

          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{data.events.length === 0 ? 'No scoring yet this week.' : 'Nothing for this filter yet.'}</p>
          ) : (
            <>
              <Runs rows={board.active} />
              {board.scoring.length > 0 && (
                <div>
                  <h3 className="py-1 text-xs font-semibold text-slate-300">Scoring plays</h3>
                  <ol className="flex flex-col gap-1">
                    {board.scoring.map((r) => (r.kind === 'calledBack' ? <CalledBackRow key={r.key} row={r} /> : <PlayerRow key={r.key} row={r} tint={scoringTint(r)} />))}
                  </ol>
                </div>
              )}
              {board.earlier.length > 0 && (
                <details>
                  <summary className="cursor-pointer py-1 text-xs font-semibold text-slate-300">Earlier ({board.earlier.length})</summary>
                  <Runs rows={board.earlier} />
                </details>
              )}
            </>
          )}
          <p className="text-xs text-slate-400">Each number is the change in your margin, scored by each league's own rules. Pending means that league's site hasn't updated yet.</p>
        </>
      )}
    </section>
  );
}
