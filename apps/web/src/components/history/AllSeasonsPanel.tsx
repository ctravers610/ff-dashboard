import type { WarehouseSeason } from '@ffd/shared';
import { useAllSeasons } from '../../api';
import { signed } from '../../format';

const recordText = ({ wins, losses, ties }: WarehouseSeason['record']) => `${wins}-${losses}${ties ? `-${ties}` : ''}`;

// Every season of this league, from the analytics warehouse: the finish, the
// record three ways, luck, and what lineups and pickups were worth. Shown only
// when the app is connected to the warehouse and has this league in it.
export function AllSeasonsPanel({ platform, leagueId }: { platform: string; leagueId: string }) {
  const { data, error } = useAllSeasons();
  if (platform !== 'sleeper') return null;
  if (error) return <p className="text-sm text-slate-400">Couldn't load past seasons: {error.message}</p>;
  const league = data?.leagues.find((l) => l.seasons.some((s) => s.leagueId === leagueId));
  if (!league) return null;

  return (
    <section aria-label="All seasons" className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">All seasons</h3>
      <div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-1 text-left font-medium">Season</th>
              <th className="py-1 text-right font-medium">Finish</th>
              <th className="py-1 text-right font-medium">Record</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell" title="As if you played every team every week">
                All-play
              </th>
              <th className="py-1 text-right font-medium" title="Wins beyond what your scores earned">
                Luck
              </th>
              <th className="hidden py-1 text-right font-medium sm:table-cell" title="Points a better lineup would have added">
                Bench pts
              </th>
              <th className="hidden py-1 text-right font-medium md:table-cell" title="Waiver and free-agent adds, and what they scored as your starters">
                Pickups
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {league.seasons.map((s) => (
              <tr key={s.leagueId}>
                <td className="py-1.5 pr-2">
                  {s.season}
                  {s.teamName && <span className="hidden text-xs text-slate-400 sm:inline"> · {s.teamName}</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {s.finish}
                  <span className="text-xs text-slate-400"> of {s.teams}</span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {recordText(s.record)}
                  {s.medianRecord && <span className="block text-xs text-slate-400">{recordText(s.medianRecord)} median</span>}
                </td>
                <td className="hidden py-1.5 text-right tabular-nums text-slate-300 sm:table-cell">{recordText(s.allPlay)}</td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${s.luck >= 0.5 ? 'text-emerald-400' : s.luck <= -0.5 ? 'text-rose-300' : 'text-slate-300'}`}>
                  {signed(s.luck)}
                </td>
                <td className="hidden py-1.5 text-right tabular-nums text-slate-300 sm:table-cell">
                  {s.pointsLeftOnBench.toFixed(1)}
                  {s.lineupEfficiency != null && (
                    <span className="block text-xs text-slate-400">{Math.round(s.lineupEfficiency * 100)}% of best</span>
                  )}
                </td>
                <td className="hidden py-1.5 text-right tabular-nums text-slate-300 md:table-cell">
                  {s.pickups}
                  <span className="text-xs text-slate-400">{s.faabSpent ? ` · $${s.faabSpent}` : ''}</span>
                  <span className="block text-xs text-slate-400">{s.pickupPoints.toFixed(1)} pts started</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Regular season only. Luck is head-to-head wins minus the wins your scores earned against the whole league each week. From the analytics
        warehouse, refreshed when it loads.
      </p>
    </section>
  );
}
