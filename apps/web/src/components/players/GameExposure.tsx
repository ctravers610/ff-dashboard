import { useState } from 'react';
import { kickoffLabel, type GameExposure as Game } from './games';

const SHOWN = 5;

// How many of your starting slots ride on each NFL game this week. Picking a
// game narrows the player list to it.
export function GameExposure({ games, byeStarts, value, onChange }: { games: Game[]; byeStarts: number; value: string | null; onChange: (key: string | null) => void }) {
  const [all, setAll] = useState(false);
  if (games.length === 0 && byeStarts === 0) return null;
  const shown = all ? games : games.slice(0, SHOWN);

  return (
    <section aria-label="Starters by game" className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Starters by game</h2>
      {byeStarts > 0 && (
        <p role="note" className="rounded-md bg-rose-950/70 px-2.5 py-1.5 text-xs font-medium text-rose-200 ring-1 ring-rose-800">
          {byeStarts} starter{byeStarts > 1 ? 's' : ''} on bye this week
        </p>
      )}
      <div role="group" aria-label="Game" className="flex flex-col gap-1">
        {shown.map((g) => {
          const selected = value === g.key;
          const kickoff = g.started ? 'Underway or over' : kickoffLabel(g.kickoff);
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : g.key)}
              className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition ${selected ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-800'}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{g.key.replace('–', ' – ')}</span>
                {kickoff && <span className={`text-xs ${selected ? 'text-slate-600' : 'text-slate-400'}`}>{kickoff}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end text-xs tabular-nums">
                <span className="font-semibold">{g.starts} start{g.starts === 1 ? '' : 's'}</span>
                {g.against > 0 && <span className={selected ? 'text-rose-700' : 'text-rose-300'}>{g.against} against</span>}
              </span>
            </button>
          );
        })}
      </div>
      {games.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="self-start text-xs font-medium text-slate-400 hover:text-slate-200">
          {all ? 'Show fewer' : `Show all ${games.length} games`}
        </button>
      )}
    </section>
  );
}
