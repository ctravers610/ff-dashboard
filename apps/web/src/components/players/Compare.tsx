import type { DefenseResponse, PlayerExposure } from '@ffd/shared';
import type { ReactNode } from 'react';
import { useDefense } from '../../api';
import { ordinal } from '../../format';
import { gameLabel, starts } from './games';

const SIDELINED = new Set(['Out', 'IR', 'PUP', 'Suspended']);
const canPlay = (p: PlayerExposure) => !SIDELINED.has(p.player.injuryStatus ?? '') && p.game?.opponent !== null;

/** How the defense he faces this week has treated his position: points allowed per game, and its rank. */
export function matchupFor(p: PlayerExposure, defense: DefenseResponse | undefined) {
  const opp = p.game?.opponent;
  const line = opp ? defense?.teams[opp]?.[p.player.position] : undefined;
  const average = defense?.leagueAverage[p.player.position];
  if (!opp || !line || !average) return null;
  return { opponent: opp, ...line, average, teams: Object.values(defense!.teams).filter((t) => t[p.player.position]).length };
}

/**
 * The projection weighed by the matchup: halfway between the projection and
 * what it would be if he did exactly as much better (or worse) than usual as
 * the defense allows to his position.
 */
export function adjusted(p: PlayerExposure, defense: DefenseResponse | undefined): number | null {
  if (p.projected == null) return null;
  const m = matchupFor(p, defense);
  return m ? p.projected * (1 + 0.5 * (m.allowed / m.average - 1)) : p.projected;
}

// A one-line answer, when there is one: who to start, by the projection weighed by matchup.
function verdict(a: PlayerExposure, b: PlayerExposure, defense: DefenseResponse | undefined): string | null {
  const [okA, okB] = [canPlay(a), canPlay(b)];
  if (okA !== okB) {
    const [out, other] = okA ? [b, a] : [a, b];
    const why = out.game?.opponent === null ? 'is on bye' : `is ${out.player.injuryStatus}`;
    return `${out.player.name} ${why}: start ${other.player.name}.`;
  }
  const [pa, pb] = [adjusted(a, defense), adjusted(b, defense)];
  if (!okA || pa == null || pb == null) return null;
  const weighed = matchupFor(a, defense) != null || matchupFor(b, defense) != null;
  const diff = Math.abs(pa - pb);
  if (diff < 0.5) return weighed ? 'Too close to call, even with the matchups: go with your gut.' : 'Too close to call on projections: go with the better matchup.';
  const better = pa > pb ? a : b;
  return `${better.player.name} projects ${diff.toFixed(1)} more (PPR${weighed ? ', weighed by matchup' : ''}).`;
}

function Matchup({ p, defense }: { p: PlayerExposure; defense: DefenseResponse | undefined }) {
  const m = matchupFor(p, defense);
  if (!m) return <>—</>;
  const tone = m.rank <= m.teams / 4 ? 'text-emerald-400' : m.rank > (m.teams * 3) / 4 ? 'text-rose-300' : 'text-slate-200';
  return (
    <>
      <span className={tone}>
        {m.opponent} allows {m.allowed.toFixed(1)} to {p.player.position}s
      </span>
      <span className="block text-xs text-slate-400">
        {ordinal(m.rank)} most of {m.teams} · average {m.average.toFixed(1)}
      </span>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Side({ p, best, defense }: { p: PlayerExposure; best: boolean; defense: DefenseResponse | undefined }) {
  const benched = p.owned.length - starts(p);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="truncate font-semibold">{p.player.name}</h3>
        <p className="text-xs text-slate-400">
          {p.player.position} · {p.player.nflTeam ?? 'FA'}
          {p.player.injuryStatus && <span className="ml-1 font-medium text-amber-400">{p.player.injuryStatus}</span>}
        </p>
      </div>
      <dl className="flex flex-col gap-2">
        <Row label="This week">{gameLabel(p.game) ?? 'Unknown'}</Row>
        <Row label="Matchup (PPR per game)">
          <Matchup p={p} defense={defense} />
        </Row>
        <Row label="Projection (PPR)">
          <span className={`text-lg font-semibold tabular-nums ${best ? 'text-emerald-400' : ''}`}>{p.projected != null ? p.projected.toFixed(1) : '—'}</span>
        </Row>
        <Row label="Your leagues">
          {p.owned.length === 0 ? 'Not on your teams' : `Starting in ${starts(p)}${benched ? `, bench in ${benched}` : ''}`}
        </Row>
        {p.facing.length > 0 && <Row label="Against you">{p.facing.map((f) => f.leagueName).join(', ')}</Row>}
      </dl>
    </div>
  );
}

/** Two players side by side: this week's game, projection, and where they matter to you. */
export function Compare({ players, onRemove, onClear }: { players: PlayerExposure[]; onRemove: (key: string) => void; onClear: () => void }) {
  const [a, b] = players;
  const defense = useDefense().data;
  if (!a) return null;
  const top = a && b && a.projected != null && b.projected != null ? (a.projected >= b.projected ? a.key : b.key) : null;
  const call = b ? verdict(a, b, defense) : null;

  return (
    <section aria-label="Compare players" className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Start / sit</h2>
        <button type="button" onClick={onClear} className="text-sm font-medium text-slate-400 hover:text-slate-200">
          Clear
        </button>
      </header>
      {b ? (
        <>
          {call && <p className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium">{call}</p>}
          <div className="grid grid-cols-2 gap-5">
            <Side p={a} best={top === a.key} defense={defense} />
            <Side p={b} best={top === b.key} defense={defense} />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-300">
          Pick one more player to compare with <span className="font-medium">{a.player.name}</span>.{' '}
          <button type="button" onClick={() => onRemove(a.key)} className="text-slate-400 underline hover:text-slate-200">
            Remove
          </button>
        </p>
      )}
      <p className="text-xs text-slate-400">
        Projections are Sleeper's PPR numbers, for comparing players, not your league's own scoring. The call weighs each one by how much his
        opponent has allowed to his position this season.
      </p>
    </section>
  );
}
