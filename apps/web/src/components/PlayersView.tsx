import type { PlayerExposure } from '@ffd/shared';
import { useMemo, useState } from 'react';

type Filter = 'shared' | 'conflicts' | 'facing' | 'all';

const FILTERS: { value: Filter; label: string; test: (p: PlayerExposure) => boolean }[] = [
  { value: 'shared', label: 'In 2+ leagues', test: (p) => p.owned.length > 1 },
  { value: 'conflicts', label: 'Start & face', test: (p) => isConflict(p) },
  { value: 'facing', label: 'Facing', test: (p) => p.facing.length > 0 },
  { value: 'all', label: 'All', test: () => true },
];

// You start him somewhere, but an opponent is also starting him against you.
const isConflict = (p: PlayerExposure) => p.facing.length > 0 && p.owned.some((o) => o.status === 'starter');

const STATUS_STYLE = {
  starter: 'bg-emerald-950 text-emerald-300',
  bench: 'bg-slate-800 text-slate-300',
  ir: 'line-through bg-slate-900 text-slate-400',
};

function Chip({ className, title, children }: { className: string; title: string; children: string }) {
  return (
    <span title={title} className={`inline-block max-w-[11rem] truncate rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function PlayersView({ players }: { players: PlayerExposure[] }) {
  const [filter, setFilter] = useState<Filter>('shared');
  const [search, setSearch] = useState('');

  // Recompute only when the inputs change, not on every render.
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test;
    const q = search.trim().toLowerCase();
    return players.filter((p) => test(p) && (!q || p.player.name.toLowerCase().includes(q)));
  }, [players, filter, search]);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, players.filter(f.test).length]));

  return (
    <section className="rounded-xl border p-5 shadow-sm border-slate-800 bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                filter === f.value
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {f.label} <span className="font-normal">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players"
          className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm sm:w-56 border-slate-700"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No players match.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {visible.map((p) => (
            <li key={p.key} className="grid gap-2 py-3 sm:grid-cols-[14rem_1fr_1fr] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.player.name}</span>
                  {isConflict(p) && (
                    <span className="shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase bg-amber-950 text-amber-300">
                      Conflict
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {p.player.position} · {p.player.nflTeam ?? 'FA'}
                  {p.player.injuryStatus && <span className="ml-1 font-medium text-amber-400">{p.player.injuryStatus}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.owned.map((o) => (
                  <Chip key={o.leagueId} className={STATUS_STYLE[o.status]} title={`${o.leagueName}: ${o.status}`}>
                    {o.leagueName}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {p.facing.map((f) => (
                  <Chip
                    key={f.leagueId}
                    className="bg-rose-950 text-rose-300"
                    title={`Your ${f.leagueName} opponent is starting him`}
                  >
                    {`vs ${f.leagueName}`}
                  </Chip>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Starting</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Bench / IR</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Opponent starting him this week</span>
      </p>
    </section>
  );
}
