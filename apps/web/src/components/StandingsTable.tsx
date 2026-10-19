import type { TeamStanding } from '@ffd/shared';
import { pts, record } from '../format';

export function StandingsTable({ standings, myTeamId }: { standings: TeamStanding[]; myTeamId: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-slate-400">
        <tr>
          <th className="py-1 text-left font-medium">#</th>
          <th className="py-1 text-left font-medium">Team</th>
          <th className="py-1 text-right font-medium">W-L</th>
          <th className="py-1 text-right font-medium">PF</th>
          <th className="hidden py-1 text-right font-medium sm:table-cell">PA</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((t) => (
          <tr
            key={t.teamId}
            className={t.teamId === myTeamId ? 'font-semibold bg-sky-950/50' : ''}
          >
            <td className="py-1 pr-2 tabular-nums">{t.rank}</td>
            <td className="max-w-0 truncate py-1 pr-2">{t.teamName}</td>
            <td className="py-1 text-right tabular-nums">{record(t)}</td>
            <td className="py-1 pl-2 text-right tabular-nums">{pts(t.pointsFor)}</td>
            <td className="hidden py-1 pl-2 text-right tabular-nums sm:table-cell">{pts(t.pointsAgainst)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
