import type { RosterEntry } from '@ffd/shared';

const GROUPS = [
  { status: 'starter', label: 'Starters' },
  { status: 'bench', label: 'Bench' },
  { status: 'ir', label: 'IR' },
] as const;

// Full roster grouped by status, for leagues without live matchup data.
export function RosterList({ roster }: { roster: RosterEntry[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {GROUPS.map(({ status, label }) => {
        const players = roster.filter((r) => r.status === status);
        if (players.length === 0) return null;
        return (
          <div key={status}>
            <div className="mb-1 text-xs font-medium uppercase text-slate-400">{label}</div>
            <ul className="divide-y divide-slate-800">
              {players.map(({ player }) => (
                <li key={player.playerId} className="flex items-baseline justify-between gap-2 py-1">
                  <span className="truncate">{player.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {player.position} · {player.nflTeam ?? 'FA'}
                    {player.injuryStatus && <span className="ml-1 font-medium text-amber-400">{player.injuryStatus}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
