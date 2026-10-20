import type { PlayerExposure } from '@ffd/shared';
import type { ReactNode } from 'react';
import { gameLabel, starts } from './games';

const SIDELINED = new Set(['Out', 'IR', 'PUP', 'Suspended']);
const canPlay = (p: PlayerExposure) => !SIDELINED.has(p.player.injuryStatus ?? '') && p.game?.opponent !== null;

// A one-line answer, when there is one: who to start, by the neutral projection.
function verdict(a: PlayerExposure, b: PlayerExposure): string | null {
  const [okA, okB] = [canPlay(a), canPlay(b)];
  if (okA !== okB) {
    const [out, other] = okA ? [b, a] : [a, b];
    const why = out.game?.opponent === null ? 'is on bye' : `is ${out.player.injuryStatus}`;
    return `${out.player.name} ${why}: start ${other.player.name}.`;
  }
  if (!okA || a.projected == null || b.projected == null) return null;
  const diff = Math.abs(a.projected - b.projected);
  if (diff < 0.5) return 'Too close to call on projections: go with the better matchup.';
  const better = a.projected > b.projected ? a : b;
  return `${better.player.name} projects ${diff.toFixed(1)} more (PPR).`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Side({ p, best }: { p: PlayerExposure; best: boolean }) {
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
  if (!a) return null;
  const top = a && b && a.projected != null && b.projected != null ? (a.projected >= b.projected ? a.key : b.key) : null;
  const call = b ? verdict(a, b) : null;

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
            <Side p={a} best={top === a.key} />
            <Side p={b} best={top === b.key} />
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
      <p className="text-xs text-slate-400">Projections are Sleeper's PPR numbers, for comparing players, not your league's own scoring.</p>
    </section>
  );
}
