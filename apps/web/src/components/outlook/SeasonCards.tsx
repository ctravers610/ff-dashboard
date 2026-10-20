import type { LeagueOutlook } from '@ffd/shared';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

// Every team's real record next to how it scored: all-play (as if it played
// every team every week) and the wins that's worth. Luck is the difference.
export function LuckTable({ outlook }: { outlook: LeagueOutlook }) {
  if (outlook.luck.length === 0) return null;
  return (
    <section aria-label="Luck" className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">Luck</h3>
      <div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-1 text-left font-medium">Team</th>
              <th className="py-1 text-right font-medium">Record</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell" title="As if every team played every other team every week">All-play</th>
              <th className="py-1 text-right font-medium" title="Wins their scoring was worth">Earned</th>
              <th className="py-1 text-right font-medium">Luck</th>
              <th className="hidden py-1 text-right font-medium sm:table-cell" title="Points scored against them">Pts against</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {outlook.luck.map((r) => (
              <tr key={r.teamName} className={r.isMe ? 'bg-slate-800/50' : ''}>
                <td className="max-w-0 truncate py-1.5 pr-2">
                  {r.teamName}
                  {r.isMe && <span className="text-xs text-slate-400"> (you)</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ''}
                </td>
                <td className="hidden py-1.5 text-right tabular-nums text-slate-300 sm:table-cell">
                  {r.allPlayWins}-{r.allPlayLosses}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-300">{r.expectedWins.toFixed(1)}</td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${r.luck >= 0.5 ? 'text-emerald-400' : r.luck <= -0.5 ? 'text-rose-300' : 'text-slate-300'}`}>
                  {signed(r.luck)}
                </td>
                <td className="hidden py-1.5 text-right tabular-nums text-slate-400 sm:table-cell">{r.pointsAgainst.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Head-to-head games only. "Earned" is the wins a team's weekly scores were worth against the whole league; luck is real wins minus that.
      </p>
    </section>
  );
}

// The league's superlatives so far.
export function Awards({ outlook }: { outlook: LeagueOutlook }) {
  if (outlook.awards.length === 0) return null;
  return (
    <section aria-label="Season awards" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold">Season awards</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {outlook.awards.map((a) => (
          <li key={a.title} className={`flex flex-col gap-0.5 rounded-lg px-3 py-2.5 ${a.isMe ? 'bg-slate-800/70 ring-1 ring-slate-500' : 'bg-slate-950/50'}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{a.title}</span>
            <span className="font-medium">
              {a.teamName}
              {a.isMe && <span className="text-xs font-normal text-slate-400"> (you)</span>}
            </span>
            <span className="text-xs text-slate-400">{a.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
