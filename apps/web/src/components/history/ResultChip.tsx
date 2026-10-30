import type { WeekResult } from '@ffd/shared';

const STYLE = {
  win: { letter: 'W', word: 'Win', cls: 'bg-emerald-950 text-emerald-300' },
  loss: { letter: 'L', word: 'Loss', cls: 'bg-rose-950 text-rose-300' },
  tie: { letter: 'T', word: 'Tie', cls: 'bg-slate-800 text-slate-300' },
  live: { letter: 'LIVE', word: 'In progress', cls: 'bg-sky-950 text-sky-300' },
} as const;

// Win/loss is a status, so color never carries it alone: the letter does too.
// An estimated result (re-scored from a lineup that could have changed) gets a
// dashed outline, and says so in its title and to screen readers.
export function ResultChip({ result, week, estimated = false }: { result: WeekResult; week: number; estimated?: boolean }) {
  if (!result) {
    return (
      <span className="inline-flex h-6 min-w-6 items-center justify-center text-xs text-slate-400" title={`Week ${week}: no result`}>
        —
      </span>
    );
  }
  const s = STYLE[result];
  return (
    <span
      title={`Week ${week}: ${s.word.toLowerCase()}${estimated ? ' (estimate)' : ''}`}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold ${s.cls} ${estimated ? 'border border-dashed border-current' : ''}`}
    >
      {/* Screen readers get the full word; the letter is the compact visual form. */}
      <span className="sr-only">
        Week {week}: {s.word}
        {estimated && ', estimated'}
      </span>
      <span aria-hidden>{s.letter}</span>
    </span>
  );
}
