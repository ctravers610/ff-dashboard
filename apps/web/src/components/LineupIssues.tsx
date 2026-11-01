import type { LeagueSummary } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useDemo } from '../api';
import { PLATFORM_LABEL } from '../format';
import type { LineupIssue } from '../lineupHealth';
import { AlertIcon, ExternalIcon } from './icons';

// Where to fix a lineup: the platform's own page for your team, when it has one.
function lineupUrl(league: LeagueSummary): string | null {
  if (league.platform === 'sleeper') return `https://sleeper.com/leagues/${league.leagueId}/team`;
  if (league.platform === 'yahoo') {
    // League key "461.l.777001", team key "461.l.777001.t.4": the page is /f1/777001/4.
    const [leagueNum, teamNum] = [league.leagueId.split('.l.')[1], league.myTeamId.split('.t.')[1]];
    return leagueNum && teamNum ? `https://football.fantasysports.yahoo.com/f1/${leagueNum}/${teamNum}` : null;
  }
  if (league.platform === 'espn') {
    return `https://fantasy.espn.com/football/team?leagueId=${league.leagueId}&teamId=${league.myTeamId}`;
  }
  return null;
}

// One league's lineup problems you can still act on, each with its fix, inside
// the league's details. (Alerts about players whose games have started are
// dropped by the API.) A Questionable warning can be cleared when you know he's
// playing: the league goes back to green, with a way to undo it here.
export function LineupIssues({ league, issues }: { league: LeagueSummary; issues: LineupIssue[] }) {
  const queryClient = useQueryClient();
  const demo = useDemo();
  const clear = useMutation({
    mutationFn: ({ playerKey, cleared }: { playerKey: string; cleared: boolean }) =>
      api('/api/lineup/cleared-warnings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey, cleared }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  const cleared = league.alerts.filter((a) => a.cleared);
  if (issues.length === 0 && cleared.length === 0) return null;
  const url = lineupUrl(league);
  return (
    <section aria-label="Lineup issues" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {issues.map(({ alert, level, label, fix }) => (
          <li
            key={`${alert.slot}:${alert.playerId ?? 'empty'}:${alert.reason}`}
            className={`rounded-lg border px-3 py-2 text-sm ${level === 'red' ? 'border-rose-800 bg-rose-950/50' : 'border-amber-800 bg-amber-950/40'}`}
          >
            <p className={`flex items-center gap-2 font-medium ${level === 'red' ? 'text-rose-200' : 'text-amber-200'}`}>
              <AlertIcon className="shrink-0" />
              {label}
              <span className="font-normal text-slate-400">· {alert.slot}</span>
              {alert.clearKey && !demo && (
                <button
                  type="button"
                  onClick={() => clear.mutate({ playerKey: alert.clearKey!, cleared: true })}
                  disabled={clear.isPending}
                  aria-label={`Clear the warning for ${alert.playerName}`}
                  title="He's playing: no warning or reminder about him this week, unless his status gets worse"
                  className="ml-auto shrink-0 rounded-md border border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </p>
            <p className="pl-6 text-xs text-slate-300">{fix}</p>
          </li>
        ))}
        {cleared.map((alert) => (
          <li key={`${alert.slot}:${alert.playerId}:cleared`} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-400">
            {alert.playerName} questionable · {alert.slot} · cleared for this week
            {!demo && (
              <button
                type="button"
                onClick={() => clear.mutate({ playerKey: alert.clearKey!, cleared: false })}
                disabled={clear.isPending}
                aria-label={`Undo clearing the warning for ${alert.playerName}`}
                className="ml-auto shrink-0 rounded px-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
      {clear.isError && (
        <p role="alert" className="text-xs text-rose-300">
          Couldn't save that: {clear.error.message}
        </p>
      )}
      {url && issues.length > 0 && (
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start text-xs font-medium text-slate-300 hover:underline">
          Fix it on {PLATFORM_LABEL[league.platform]}
          <ExternalIcon />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}
