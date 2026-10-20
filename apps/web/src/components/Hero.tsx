import type { DashboardResponse, Matchup } from '@ffd/shared';
import { matchupStatus } from '../format';

// Nobody has scored yet: before the week's first game, "winning" means nothing.
const underway = (m: Matchup | null) =>
  !!m && (m.me.points !== 0 || (m.opponent?.points ?? 0) !== 0 || (m.allPlay?.teams.some((t) => t.points !== 0) ?? false));

// The week at a glance: how many matchups you're winning, your season record,
// and one block per league (teal = winning, rose = losing, gray = no matchup).
// Until the week's games start, it shows the projection instead, with the
// blocks outlined rather than filled.
export function Hero({ data }: { data: DashboardResponse }) {
  const statuses = data.leagues.map((l) => ({ key: `${l.platform}:${l.leagueId}`, ...matchupStatus(l.matchup) }));
  const withMatchup = statuses.filter((s) => s.leading != null);
  const leading = withMatchup.filter((s) => s.leading).length;
  const projected = statuses.filter((s) => s.projectedWin).length;
  const started = data.leagues.some((l) => underway(l.matchup));
  const record = data.leagues.reduce(
    (acc, l) => {
      const me = l.standings.find((t) => t.teamId === l.myTeamId);
      return { wins: acc.wins + (me?.wins ?? 0), losses: acc.losses + (me?.losses ?? 0) };
    },
    { wins: 0, losses: 0 },
  );

  const headline =
    withMatchup.length === 0 ? 'No matchups this week' : started ? `${leading} of ${withMatchup.length} winning` : `Projected to win ${projected} of ${withMatchup.length}`;
  const block = (s: (typeof statuses)[number]) => {
    if (started) return s.leading == null ? 'bg-slate-700' : s.leading ? 'bg-emerald-500' : 'bg-rose-500';
    // Projected: outlined, since nothing has happened yet.
    return s.projectedWin == null ? 'bg-slate-700' : s.projectedWin ? 'border-2 border-emerald-500' : 'border-2 border-rose-500';
  };

  return (
    <section aria-label="This week" className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-hero px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs text-slate-400">
          {data.season} season · Week {data.week} · <span className="whitespace-nowrap">updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </p>
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</p>
        <p className="text-sm text-slate-400">
          Season {record.wins}-{record.losses}
          {withMatchup.length > 0 && (started ? ` · projected ${projected} of ${withMatchup.length}` : ' · no games played yet this week')}
        </p>
      </div>
      <div className="flex shrink-0 gap-1" aria-hidden="true">
        {statuses.map((s) => (
          <span key={s.key} className={`h-9 w-3 rounded-sm ${block(s)}`} />
        ))}
      </div>
    </section>
  );
}
