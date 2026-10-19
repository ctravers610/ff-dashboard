import type { DashboardResponse } from '@ffd/shared';
import { matchupStatus } from '../format';

// The week at a glance: how many matchups you're winning, your season record,
// and one block per league (teal = winning, rose = losing, gray = no matchup).
export function Hero({ data }: { data: DashboardResponse }) {
  const statuses = data.leagues.map((l) => ({ key: `${l.platform}:${l.leagueId}`, ...matchupStatus(l.matchup) }));
  const withMatchup = statuses.filter((s) => s.leading != null);
  const leading = withMatchup.filter((s) => s.leading).length;
  const projected = statuses.filter((s) => s.projectedWin).length;
  const record = data.leagues.reduce(
    (acc, l) => {
      const me = l.standings.find((t) => t.teamId === l.myTeamId);
      return { wins: acc.wins + (me?.wins ?? 0), losses: acc.losses + (me?.losses ?? 0) };
    },
    { wins: 0, losses: 0 },
  );

  return (
    <section aria-label="This week" className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-hero px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs text-slate-400">
          {data.season} season · Week {data.week} · <span className="whitespace-nowrap">updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </p>
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {withMatchup.length > 0 ? `${leading} of ${withMatchup.length} winning` : 'No matchups this week'}
        </p>
        <p className="text-sm text-slate-400">
          Season {record.wins}-{record.losses}
          {withMatchup.length > 0 && ` · projected ${projected} of ${withMatchup.length}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1" aria-hidden="true">
        {statuses.map((s) => (
          <span
            key={s.key}
            className={`h-9 w-3 rounded-sm ${s.leading == null ? 'bg-slate-700' : s.leading ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
        ))}
      </div>
    </section>
  );
}
