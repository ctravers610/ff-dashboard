import type { LeagueOutlook } from '@ffd/shared';
import { useOutlook } from '../../api';
import { ordinal } from '../../format';

export const percent = (p: number) => (p > 0.99 && p < 1 ? '>99%' : p < 0.01 && p > 0 ? '<1%' : `${Math.round(p * 100)}%`);

/** One league's outlook from the shared query, or null while it loads or for leagues without one (FFPC). */
export function useLeagueOutlook(platform: string, leagueId: string): LeagueOutlook | null {
  return useOutlook().data?.leagues.find((l) => l.platform === platform && l.leagueId === leagueId) ?? null;
}

// Your next opponent at a glance: how they've been playing, who they're
// missing, and your chance from both teams' scoring this season.
export function UpNext({ outlook }: { outlook: LeagueOutlook }) {
  const n = outlook.next;
  if (!n) return null;
  return (
    <section aria-label="Up next" className="flex flex-col gap-1 rounded-lg bg-slate-950/50 px-3 py-2.5 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Week {n.week}</span>{' '}
          <span className="font-medium">vs {n.teamName}</span>{' '}
          <span className="text-slate-400">
            {n.record}, {ordinal(n.rank)}
            {n.avgPoints != null && ` · ${n.avgPoints.toFixed(1)} a week`}
            {n.recent.length > 0 && ` · last ${n.recent.length}: ${n.recent.join('')}`}
          </span>
        </span>
        <span className="tabular-nums text-slate-300" title="From both teams' scoring so far this season">
          {percent(n.winChance)} to win
        </span>
      </p>
      {n.injuredStarters.length > 0 && (
        <p className="text-xs text-amber-300">
          Starting hurt: {n.injuredStarters.map((p) => `${p.name} ${p.position} (${p.status})`).join(', ')}
        </p>
      )}
    </section>
  );
}
