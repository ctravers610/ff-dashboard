import { unfilledSlots, type Platform } from '@ffd/shared';
import { useByeWeeks, useDashboard } from '../../api';

const onBye = (team: string | null, teams: Set<string>) => !!team && teams.has(team);

/**
 * The bye weeks left for one league: who's out each week and whether the rest
 * of the roster can still fill every starting slot. Weeks with no byes on your
 * roster are left out.
 */
export function ByePlanner({ platform, leagueId }: { platform: Platform; leagueId: string }) {
  const dashboard = useDashboard();
  const byes = useByeWeeks();
  const league = dashboard.data?.leagues.find((l) => l.platform === platform && l.leagueId === leagueId);
  if (!league || !byes.data) return null;

  // Your starting slots, from this week's lineup. Unknown without a matchup.
  const slots = league.matchup?.me.starters.map((s) => s.slot) ?? [];
  const active = league.roster.filter((r) => r.status !== 'ir').map((r) => r.player);
  const weeks = byes.data.weeks
    .map(({ week, teams }) => {
      const set = new Set(teams);
      const out = active.filter((p) => onBye(p.nflTeam, set));
      const available = active.filter((p) => !onBye(p.nflTeam, set)).map((p) => p.position);
      return { week, out, short: slots.length ? unfilledSlots(slots, available) : null };
    })
    .filter((w) => w.out.length > 0);

  return (
    <section aria-label="Bye weeks" className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">Bye weeks</h3>
      <p className="mb-2 text-xs text-slate-400">Who's out each week from here on, and whether the rest of your roster can still fill a lineup.</p>
      {weeks.length === 0 ? (
        <p className="text-sm text-slate-400">No byes left on your roster.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {weeks.map((w) => (
            <li key={w.week} className="grid gap-1 py-2 text-sm sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span className="font-medium">Week {w.week}</span>
              <span className="text-slate-300">
                {w.out.map((p, i) => (
                  <span key={p.playerId}>
                    {i > 0 && ', '}
                    {p.name} <span className="text-slate-400">{p.position}</span>
                  </span>
                ))}
              </span>
              {w.short == null ? null : w.short.length > 0 ? (
                <span className="justify-self-start rounded bg-rose-950 px-2 py-0.5 text-xs font-semibold text-rose-200 sm:justify-self-end">
                  Short: {w.short.join(', ')}
                </span>
              ) : (
                <span className="justify-self-start text-xs text-slate-400 sm:justify-self-end">Lineup covered</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
