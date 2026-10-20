import type { PlayerExposure } from '@ffd/shared';
import { useMemo, useState } from 'react';
import { Compare } from './players/Compare';
import { GameExposure } from './players/GameExposure';
import { exposureByGame, gameKey, gameLabel } from './players/games';

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

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const select = 'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100';

// Filters on the left, the players in a table on the right (filters above on phones).
export function PlayersView({ players }: { players: PlayerExposure[] }) {
  const [filter, setFilter] = useState<Filter>('shared');
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('All');
  const [league, setLeague] = useState('all');
  const [game, setGame] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]); // up to two player keys
  const toggleCompare = (key: string) => setCompare((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key].slice(-2)));
  const compared = compare.flatMap((k) => players.find((p) => p.key === k) ?? []);
  const byGame = useMemo(() => exposureByGame(players), [players]);

  // Every league a player appears in, yours or your opponent's, for the league filter.
  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of players) for (const l of [...p.owned, ...p.facing]) seen.set(l.leagueId, l.leagueName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [players]);

  // Recompute only when the inputs change, not on every render.
  const narrowed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) =>
        (!q || p.player.name.toLowerCase().includes(q)) &&
        (position === 'All' || p.player.position === position) &&
        (league === 'all' || [...p.owned, ...p.facing].some((l) => l.leagueId === league)) &&
        (!game || gameKey(p) === game),
    );
  }, [players, search, position, league, game]);
  const visible = narrowed.filter(FILTERS.find((f) => f.value === filter)!.test);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, narrowed.filter(f.test).length]));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <aside aria-label="Filters" className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players"
            aria-label="Search players"
            className="w-full rounded-lg border border-slate-700 bg-transparent px-3 py-1.5 text-sm"
          />
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1 lg:flex-col">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm font-medium transition ${
                  filter === f.value ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {f.label} <span className="font-normal tabular-nums">{counts[f.value]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Position
              <select value={position} onChange={(e) => setPosition(e.target.value)} className={select}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'All' ? 'All positions' : p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              League
              <select value={league} onChange={(e) => setLeague(e.target.value)} className={select}>
                <option value="all">All leagues</option>
                {leagues.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="flex flex-col gap-1 text-xs text-slate-400">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />Starting</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-400" />Bench / IR</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500" />Opponent starting him this week</span>
          </p>
        </aside>
        <GameExposure games={byGame.games} byeStarts={byGame.byeStarts} value={game} onChange={setGame} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Compare players={compared} onRemove={toggleCompare} onClear={() => setCompare([])} />
        <section aria-label="Players" className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-3">
          <div className="hidden grid-cols-[14rem_1fr_1fr_auto] gap-2 border-b border-slate-800 pb-2 text-xs text-slate-400 sm:grid" aria-hidden="true">
            <span>Player</span>
            <span>Your leagues</span>
            <span>Starting against you</span>
            <span className="w-20" />
          </div>
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No players match.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {visible.map((p) => (
                <li key={p.key} className="grid gap-2 py-3 sm:grid-cols-[14rem_1fr_1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.player.name}</span>
                      {isConflict(p) && (
                        <span className="shrink-0 rounded bg-amber-950 px-1.5 text-[10px] font-semibold uppercase text-amber-300">Conflict</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {p.player.position} · {p.player.nflTeam ?? 'FA'}
                      {p.player.injuryStatus && <span className="ml-1 font-medium text-amber-400">{p.player.injuryStatus}</span>}
                      {gameLabel(p.game) && <span className={p.game?.opponent === null ? 'text-rose-300' : ''}> · {gameLabel(p.game)}</span>}
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
                      <Chip key={f.leagueId} className="bg-rose-950 text-rose-300" title={`Your ${f.leagueName} opponent is starting him`}>
                        {`vs ${f.leagueName}`}
                      </Chip>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={compare.includes(p.key)}
                    aria-label={`Compare ${p.player.name}`}
                    onClick={() => toggleCompare(p.key)}
                    className={`w-20 justify-self-start rounded-md border px-2 py-1 text-xs font-medium transition sm:justify-self-end ${
                      compare.includes(p.key) ? 'border-slate-100 bg-slate-100 text-slate-900' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {compare.includes(p.key) ? 'Comparing' : 'Compare'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
