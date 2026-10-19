import { friendlyRun, friendlyRunWithTime, nextRun, type WaiverLeague, type WaiverMove, type WaiverPlayer, type WaiverRules } from '@ffd/shared';
import { useMemo, useState } from 'react';
import { useWaivers } from '../../api';
import { PLATFORM_LABEL } from '../../format';
import { FfpcWaiverPaste } from './FfpcWaiverPaste';

type Sort = 'week' | 'restOfSeason' | 'trending';
const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

const REASON_LABEL: Record<WaiverMove['reason'], string> = {
  empty: 'Empty slot',
  bye: 'On bye',
  injury: 'Injured',
  upgrade: 'Upgrade',
};

const fmt = (n: number | null) => (n == null ? '—' : n.toFixed(1));
const adds = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function rulesText(r: WaiverRules): string {
  const priority = r.priority != null ? `priority ${r.priority} of ${r.teams}` : null;
  if (r.type === 'faab') {
    const budget = r.faabTotal != null ? `$${r.faabLeft ?? '?'} of $${r.faabTotal} FAAB left` : `$${r.faabLeft ?? '?'} FAAB left`;
    return [budget, priority].filter(Boolean).join(' · ');
  }
  const kind = r.type === 'rolling' ? 'Rolling waivers' : 'Reverse-standings waivers';
  return [kind, priority].filter(Boolean).join(' · ');
}

const SOURCE_NOTE: Record<NonNullable<WaiverLeague['runsSource']>, string> = {
  history: "learned from this league's processed claims",
  ffpc: "from FFPC's page",
  settings: 'estimated from league settings',
};

function countdown(to: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}${hours ? ` ${hours} hr` : ''}`;
  if (hours > 0) return `in ${hours} hr ${minutes % 60} min`;
  return `in ${minutes} min`;
}

function Schedule({ league, next }: { league: WaiverLeague; next: Date | null }) {
  if (!next || !league.runsSource) {
    return <p className="-mt-3 text-sm text-slate-400">When waivers run isn't known yet: there are no processed claims to learn from.</p>;
  }
  return (
    <p className="-mt-3 text-sm text-slate-300">
      Waivers run {league.runs.map(friendlyRunWithTime).join(' and ')} ET · next {countdown(next)}{' '}
      <span className="text-slate-400">({SOURCE_NOTE[league.runsSource]})</span>
    </p>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${value === o.value ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlayerLine({ p, note }: { p: WaiverPlayer; note?: string }) {
  return (
    <span className="min-w-0">
      <span className="font-medium">{p.player.name}</span>{' '}
      <span className="text-slate-400">
        {p.player.position} · {p.player.nflTeam ?? 'FA'}
        {note && ` · ${note}`}
      </span>
      {p.player.injuryStatus && <span className="ml-1 text-xs font-medium text-amber-300">{p.player.injuryStatus}</span>}
    </span>
  );
}

function Moves({ league, week }: { league: WaiverLeague; week: number }) {
  if (league.moves.length === 0) {
    return <p className="text-sm text-slate-400">No moves to suggest: your lineup for week {week} is covered by your roster.</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {league.moves.map((m) => (
        <li key={`${m.slot}:${m.add.player.playerId}`} className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-200">
              {REASON_LABEL[m.reason]} · {m.slot}
            </span>
            <span className="font-semibold tabular-nums text-emerald-400">+{m.gain.toFixed(1)} pts in week {week}</span>
          </div>
          <p>
            <span className="text-emerald-400">Add</span> <PlayerLine p={m.add} note={m.add.availability === 'waivers' ? 'on waivers' : m.add.availability === 'free_agent' ? 'free agent' : undefined} />
          </p>
          {m.replaces && (
            <p className="text-slate-400">
              in place of {m.replaces.player.name} ({m.reason === 'upgrade' ? `${fmt(m.replaces.week)} projected` : REASON_LABEL[m.reason].toLowerCase()})
            </p>
          )}
          <p className="text-slate-400">
            {m.drop ? (
              <>
                <span className="text-rose-300">Drop</span> {m.drop.player.name} ({m.drop.player.position}, {fmt(m.drop.restOfSeason)} rest of season; replaceable from waivers)
              </>
            ) : (
              'Uses an open roster spot, no drop needed'
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Available({ league }: { league: WaiverLeague }) {
  const [sort, setSort] = useState<Sort>('week');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('All');

  // Points aren't comparable across positions (QBs and defenses outscore everyone),
  // so "All" shows the top few at each position rather than one mixed list.
  const groups = useMemo(() => {
    const key = (p: WaiverPlayer) => (sort === 'trending' ? (p.trendingAdds ?? -1) : (p[sort] ?? -1));
    const ranked = (pos: string, n: number) =>
      league.available
        .filter((p) => p.player.position === pos && (sort !== 'trending' || p.trendingAdds != null))
        .sort((a, b) => key(b) - key(a))
        .slice(0, n);
    const positions = position === 'All' ? POSITIONS.slice(1) : [position];
    return positions.map((pos) => ({ pos, rows: ranked(pos, position === 'All' ? 5 : 25) })).filter((g) => g.rows.length > 0);
  }, [league.available, sort, position]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Rank by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'restOfSeason', label: 'Rest of season' },
            { value: 'trending', label: 'Trending' },
          ]}
        />
        <Segmented label="Position" value={position} onChange={setPosition} options={POSITIONS.map((p) => ({ value: p, label: p }))} />
      </div>
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No available players match.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th scope="col" className="py-1 text-left font-normal">Player</th>
              <th scope="col" className="hidden py-1 text-right font-normal sm:table-cell">Adds (24h)</th>
              <th scope="col" className="py-1 pl-3 text-right font-normal">Week</th>
              <th scope="col" className="py-1 pl-3 text-right font-normal">Rest of season</th>
            </tr>
          </thead>
          {groups.map(({ pos, rows }) => (
          <tbody key={pos} className="divide-y divide-slate-800">
            {position === 'All' && (
              <tr>
                <th scope="rowgroup" colSpan={4} className="pb-1 pt-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {pos}
                </th>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.player.playerId}>
                <td className="py-2 pr-2">
                  <PlayerLine p={p} />
                  {p.availability === 'waivers' && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">waivers</span>}
                </td>
                <td className="hidden py-2 text-right tabular-nums text-slate-400 sm:table-cell">{p.trendingAdds != null ? adds(p.trendingAdds) : ''}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${sort === 'week' ? 'font-semibold' : 'text-slate-300'}`}>{fmt(p.week)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${sort === 'restOfSeason' ? 'font-semibold' : 'text-slate-300'}`}>{fmt(p.restOfSeason)}</td>
              </tr>
            ))}
          </tbody>
          ))}
        </table>
      )}
    </div>
  );
}

export function WaiversView() {
  const { data, error, isPending } = useWaivers();
  const [selected, setSelected] = useState<string | null>(null);

  if (isPending) return <p className="text-slate-400">Loading waivers…</p>;
  if (error) return <p role="alert" className="rounded-lg bg-rose-950/60 p-4 text-sm text-rose-200">Couldn't load waivers: {error.message}</p>;

  // The league whose waivers run soonest comes first; leagues with no known schedule go last.
  const ordered = data.leagues
    .map((l) => {
      const upcoming = nextRun(l.runs);
      return { league: l, next: upcoming?.at ?? null, label: upcoming ? friendlyRun(upcoming.run) : null };
    })
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
  const current = ordered.find((o) => `${o.league.platform}:${o.league.leagueId}` === selected) ?? ordered[0];
  const league = current?.league;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">
        Claims made now play in week {data.week}. Projections are scored with each league's own settings; rest of season runs through week{' '}
        {data.lastRegularWeek}. FFPC leagues use a pasted copy of FFPC's add/drop page.
      </p>

      {data.errors.map((e) => (
        <div key={e.source} className="rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200">
          <span className="font-medium">{e.source}:</span> {e.message}
        </div>
      ))}

      {data.leagues.length > 1 && (
        <Segmented
          label="League"
          value={league ? `${league.platform}:${league.leagueId}` : ''}
          onChange={setSelected}
          options={ordered.map(({ league: l, label }) => ({ value: `${l.platform}:${l.leagueId}`, label: label ? `${l.name} · ${label}` : l.name }))}
        />
      )}

      {league && (
        <section aria-label={`Waivers for ${league.name}`} className="flex flex-col gap-5 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {league.name} <span className="text-sm font-normal text-slate-400">· {PLATFORM_LABEL[league.platform]}</span>
            </h2>
            <p className="text-sm text-slate-300">
              {league.rules ? rulesText(league.rules) : league.platform === 'ffpc' ? '' : 'Waiver rules unavailable'}
              {league.openRosterSpots > 0 && ` · ${league.openRosterSpots} open roster spot${league.openRosterSpots > 1 ? 's' : ''}`}
            </p>
          </header>

          <Schedule league={league} next={current?.next ?? null} />

          {league.platform === 'ffpc' && <FfpcWaiverPaste key={league.leagueId} league={league} />}

          {(league.platform !== 'ffpc' || league.pastedAt) && (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">Suggested moves</h3>
                <Moves league={league} week={data.week} />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">Best available</h3>
                <Available key={`${league.platform}:${league.leagueId}`} league={league} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
