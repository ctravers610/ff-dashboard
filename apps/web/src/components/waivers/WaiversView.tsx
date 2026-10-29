import { ByePlanner } from './ByePlanner';
import { FaabPacing } from './FaabPacing';
import { friendlyRun, friendlyRunWithTime, nextRun, type LeagueSummary, type WaiverLeague, type WaiverMove, type WaiverPlayer, type WaiverRules } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { api, useDemo, useWaivers } from '../../api';
import { labelFor, leagueSubtitle, PLATFORM_LABEL, type LeagueLabel } from '../../format';
import { SideList, WithSideList } from '../SideList';
import { SourceErrors } from '../SourceErrors';
import { FfpcWaiverPaste } from './FfpcWaiverPaste';
import { Reminders } from './Reminders';

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
const keyOf = (l: WaiverLeague) => `${l.platform}:${l.leagueId}`;

const SOURCE_NOTE: Record<NonNullable<WaiverLeague['runsSource']>, string> = {
  history: "Learned from this league's processed claims",
  ffpc: "From FFPC's add/drop page",
  'ffpc-standard': "FFPC's bid times, the same in every league: Wednesdays 11 PM and Sundays 10 AM ET",
  settings: 'Estimated from league settings',
};

function countdown(to: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}${hours ? ` ${hours} hr` : ''}`;
  if (hours > 0) return `in ${hours} hr ${minutes % 60} min`;
  return `in ${minutes} min`;
}

/** "$85 of $100 FAAB" or "Reverse standings", for the league list and the budget tile. */
function budget(r: WaiverRules | null): string | null {
  if (!r) return null;
  if (r.type === 'faab') return r.faabTotal != null ? `$${r.faabLeft ?? '?'} of $${r.faabTotal} FAAB` : `$${r.faabLeft ?? '?'} FAAB`;
  return r.type === 'rolling' ? 'Rolling waivers' : 'Reverse-standings waivers';
}

// ── Choosing a league ───────────────────────────────────────────────────

interface Entry {
  league: WaiverLeague;
  name: LeagueLabel; // your team's name, with the league's beneath it
  next: Date | null;
  label: string | null; // "Tue night", "Wed 11:00 PM"
}

function ClaimsMark({ league }: { league: WaiverLeague }) {
  if (league.claims?.reminderDue) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-rose-300">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rose-500" />
        claims not set
      </span>
    );
  }
  if (league.claims?.set) return <span className="shrink-0 text-xs font-medium text-emerald-300">claims set</span>;
  if (league.pasteStale) return <span className="shrink-0 text-xs font-medium text-amber-300">re-paste</span>;
  return null;
}

// Every league, the one whose waivers run soonest first.
function LeaguePicker({ entries, value, onChange }: { entries: Entry[]; value: string; onChange: (key: string) => void }) {
  return (
    <SideList
      label="League"
      value={value}
      onChange={onChange}
      items={entries.map(({ league, name, next, label }) => ({
        key: keyOf(league),
        title: name.title,
        mark: <ClaimsMark league={league} />,
        alert: league.claims?.reminderDue,
        meta: (
          <>
            <span className="block truncate">{leagueSubtitle(name, PLATFORM_LABEL[league.platform])}</span>
            <span className="block">{label ? `${label}, ${countdown(next!)}` : 'schedule unknown'}</span>
          </>
        ),
        extra: budget(league.rules) ? <span className="text-xs text-slate-400">{budget(league.rules)}</span> : undefined,
        optionLabel: `${name.title}${label ? ` · ${label}` : ''}${league.claims?.reminderDue ? ' · claims not set' : ''}`,
      }))}
    />
  );
}

// ── The chosen league ───────────────────────────────────────────────────

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-950/50 px-3 py-2.5">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// Whether your claims are in for the next run. ESPN shows us your pending
// claims; for the others you tick it off yourself, which also stops the reminder.
function Claims({ league }: { league: WaiverLeague }) {
  const queryClient = useQueryClient();
  const mark = useMutation({
    mutationFn: (set: boolean) =>
      api('/api/waivers/claims', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: league.platform, leagueId: league.leagueId, runAt: league.claims!.runAt, set }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waivers'] }),
  });
  const claims = league.claims;
  const demo = useDemo();
  // ESPN can show your claims even when we don't know when its waivers run.
  if (!claims && league.pendingClaims?.length) return <span className="text-emerald-300">{league.pendingClaims.length} pending on ESPN</span>;
  if (!claims) return <span className="text-slate-400">—</span>;
  if (claims.source === 'espn') {
    return (
      <span className="text-emerald-300">
        {claims.pending} pending on ESPN
      </span>
    );
  }
  if (demo) return <span className="text-slate-400">{claims.set ? 'Set for this run' : 'Not set yet'}</span>;
  if (claims.set) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-emerald-300">Set for this run</span>
        <button type="button" onClick={() => mark.mutate(false)} className="rounded px-1.5 text-xs text-slate-400 hover:bg-slate-800">
          Undo
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => mark.mutate(true)}
      disabled={mark.isPending}
      className="rounded-md border border-slate-600 px-2.5 py-0.5 font-medium text-slate-100 hover:bg-slate-800"
    >
      {league.platform === 'espn' ? 'Mark claims set' : 'Claims set'}
    </button>
  );
}

function Header({ league, name, next }: { league: WaiverLeague; name: LeagueLabel; next: Date | null }) {
  const r = league.rules;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold">{name.title}</h2>
        <p className="truncate text-sm text-slate-400">{leagueSubtitle(name, PLATFORM_LABEL[league.platform])}</p>
      </div>

      {league.claims?.reminderDue && (
        <p role="status" className="rounded-md bg-rose-950/70 px-3 py-2 text-sm font-medium text-rose-200 ring-1 ring-rose-700">
          Your claims for this run aren't set yet. Make them on {PLATFORM_LABEL[league.platform]}, then mark them set here.
        </p>
      )}

      <dl className="grid gap-2 sm:grid-cols-3">
        <Tile label="Waivers run">
          {next && league.runsSource ? (
            <span title={SOURCE_NOTE[league.runsSource]}>
              {league.runs.map(friendlyRunWithTime).join(' and ')} ET
              <span className="block text-xs text-slate-400">next {countdown(next)}</span>
            </span>
          ) : (
            <span className="text-slate-400">Not known yet</span>
          )}
        </Tile>
        <Tile label="Budget and priority">
          {r ? (
            <>
              {budget(r)}
              <span className="block text-xs text-slate-400">
                {[r.priority != null ? `Priority ${r.priority} of ${r.teams}` : null, league.openRosterSpots > 0 ? `${league.openRosterSpots} open roster spot${league.openRosterSpots > 1 ? 's' : ''}` : null]
                  .filter(Boolean)
                  .join(' · ') || ' '}
              </span>
            </>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </Tile>
        <Tile label="Your claims">
          <Claims league={league} />
        </Tile>
      </dl>

      {league.platform === 'ffpc' && <FfpcWaiverPaste key={league.leagueId} league={league} />}
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

const availabilityNote = (p: WaiverPlayer) => (p.availability === 'waivers' ? 'on waivers' : p.availability === 'free_agent' ? 'free agent' : undefined);

// Each move on one aligned row: why, who to add, who to drop, what it's worth.
function Moves({ league, week }: { league: WaiverLeague; week: number }) {
  if (league.moves.length === 0) {
    return <p className="text-sm text-slate-400">Nothing to suggest: your roster covers your week {week} lineup.</p>;
  }
  return (
    <ol className="divide-y divide-slate-800">
      {league.moves.map((m) => (
        <li key={`${m.slot}:${m.add.player.playerId}`} className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,1fr)_5rem] sm:items-start">
          <span className="self-start justify-self-start rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-200">
            {REASON_LABEL[m.reason]} · {m.slot}
          </span>
          <span className="min-w-0">
            <span className="text-emerald-400">Add</span> <PlayerLine p={m.add} note={availabilityNote(m.add)} />
            {m.replaces && (
              <span className="block text-xs text-slate-400">
                {m.reason === 'upgrade'
                  ? `over ${m.replaces.player.name} (${fmt(m.replaces.week)} projected)`
                  : `for ${m.replaces.player.name} (${REASON_LABEL[m.reason].toLowerCase()})`}
              </span>
            )}
          </span>
          <span className="min-w-0">
            {m.drop ? (
              <>
                <span className="text-rose-300">Drop</span> <span className="font-medium">{m.drop.player.name}</span>{' '}
                <span className="text-slate-400">{m.drop.player.position}</span>
                <span className="block text-xs text-slate-400">{fmt(m.drop.restOfSeason)} rest of season, replaceable</span>
              </>
            ) : (
              <span className="text-slate-400">No drop: open roster spot</span>
            )}
          </span>
          <span className="tabular-nums sm:text-right">
            <span className="font-semibold text-emerald-400">+{m.gain.toFixed(1)}</span>
            <span className="block text-xs text-slate-400">pts in week {week}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// The claims you have in on ESPN, in ESPN's order: who you add, who goes, and the bid.
function PendingClaims({ league, week }: { league: WaiverLeague; week: number }) {
  const claims = league.pendingClaims ?? [];
  if (claims.length === 0) return <p className="text-sm text-slate-400">No claims in on ESPN for the next run.</p>;
  return (
    <ol className="divide-y divide-slate-800">
      {claims.map((c, i) => (
        <li key={`${c.add.player.playerId}:${c.drop?.player.playerId ?? ''}`} className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_5rem] sm:items-start">
          <span className="font-semibold tabular-nums text-slate-400">{i + 1}.</span>
          <span className="min-w-0">
            <span className="text-emerald-400">Add</span> <PlayerLine p={c.add} />
            {c.add.week != null && <span className="block text-xs text-slate-400">{fmt(c.add.week)} projected in week {week}</span>}
          </span>
          <span className="min-w-0">
            {c.drop ? (
              <>
                <span className="text-rose-300">Drop</span> <PlayerLine p={c.drop} />
                {c.drop.week != null && <span className="block text-xs text-slate-400">{fmt(c.drop.week)} projected in week {week}</span>}
              </>
            ) : (
              <span className="text-slate-400">No drop</span>
            )}
          </span>
          <span className="tabular-nums sm:text-right">{c.bid != null && <span className="font-semibold">${c.bid}</span>}</span>
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
        <div role="group" aria-label="Position" className="flex flex-wrap gap-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={position === p}
              onClick={() => setPosition(p)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${position === p ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Rank by
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
            <option value="week">This week</option>
            <option value="restOfSeason">Rest of season</option>
            <option value="trending">Trending adds</option>
          </select>
        </label>
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

// Leagues are named by your team, from the dashboard's leagues (the waivers data only has the league's name).
export function WaiversView({ leagues }: { leagues?: LeagueSummary[] }) {
  const { data, error, isPending } = useWaivers();
  const demo = useDemo();
  // A reminder notification links straight to its league: /?view=waivers&league=sleeper:123
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get('league'));

  if (isPending) return <p className="text-slate-400">Loading waivers…</p>;
  if (error) return <p role="alert" className="rounded-lg bg-rose-950/60 p-4 text-sm text-rose-200">Couldn't load waivers: {error.message}</p>;

  // The league whose waivers run soonest comes first; leagues with no known schedule go last.
  const entries: Entry[] = data.leagues
    .map((l) => {
      const upcoming = nextRun(l.runs);
      return { league: l, name: labelFor(leagues, l), next: upcoming?.at ?? null, label: upcoming ? friendlyRun(upcoming.run) : null };
    })
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
  const current = entries.find((e) => keyOf(e.league) === selected) ?? entries[0];
  const league = current?.league;
  const name = current?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400" title={`Projections use each league's own scoring; rest of season runs through week ${data.lastRegularWeek}.`}>
          Claims made now play in <span className="font-semibold text-slate-200">week {data.week}</span>.
        </p>
        {!demo && <Reminders />}
      </div>

      <SourceErrors errors={data.errors} />

      <WithSideList list={entries.length > 1 && <LeaguePicker entries={entries} value={league ? keyOf(league) : ''} onChange={setSelected} />}>
        {league && name && (
          <section aria-label={`Waivers for ${name.title}`} className="flex flex-col gap-4">
            <Header league={league} name={name} next={current?.next ?? null} />
            {league.pendingClaims && (
              <Card title="Your claims">
                <PendingClaims league={league} week={data.week} />
              </Card>
            )}
            {(league.platform !== 'ffpc' || league.pastedAt) && (
              <>
                <Card title="Suggested moves">
                  <Moves league={league} week={data.week} />
                </Card>
                <Card title="Best available">
                  <Available key={keyOf(league)} league={league} />
                </Card>
              </>
            )}
            <FaabPacing league={league} week={data.week} lastWeek={data.lastRegularWeek} />
            <ByePlanner platform={league.platform} leagueId={league.leagueId} />
          </section>
        )}
      </WithSideList>
    </div>
  );
}
