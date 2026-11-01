import { winProbability, type DashboardResponse } from '@ffd/shared';
import { matchupOver, matchupStatus, underway } from '../../format';

// The week in one line: how many wins your matchups add up to, from each one's
// chance to win. Before the games, that's a projection; after them, the result.
export function WeekSummary({ data }: { data: DashboardResponse }) {
  const matchups = data.leagues.map((l) => ({ matchup: l.matchup, chance: winProbability(l.matchup), leading: matchupStatus(l.matchup).leading })).filter((m) => m.chance != null);
  const expected = matchups.reduce((sum, m) => sum + m.chance!, 0);
  const leading = matchups.filter((m) => m.leading).length;
  const started = matchups.some((m) => underway(m.matchup));
  const over = matchups.length > 0 && matchups.every((m) => matchupOver(m.matchup));
  const record = data.leagues.reduce(
    (acc, l) => {
      const me = l.standings.find((t) => t.teamId === l.myTeamId);
      return { wins: acc.wins + (me?.wins ?? 0), losses: acc.losses + (me?.losses ?? 0) };
    },
    { wins: 0, losses: 0 },
  );

  const headline =
    matchups.length === 0 ? 'No matchups this week' : over ? `${matchups.filter((m) => m.chance! > 0.5).length} of ${matchups.length} won` : `${expected.toFixed(1)} wins expected`;
  const updated = new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const details = [
    !over && matchups.length > 0 && `of ${matchups.length}`,
    !over && matchups.length > 0 && (started ? `${leading} leading right now` : 'no games played yet this week'),
    `Week ${data.week}`,
    `Season ${record.wins}-${record.losses}`,
    `updated ${updated}`,
  ].filter(Boolean);

  return (
    <section aria-label="This week" className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <p className="text-3xl font-bold tracking-tight tabular-nums">{headline}</p>
      <p className="text-sm text-slate-300">{details.join(' · ')}</p>
    </section>
  );
}
