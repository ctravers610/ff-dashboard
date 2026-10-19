import type { LeagueSummary, LineupAlert } from '@ffd/shared';
import { PLATFORM_LABEL } from '../format';
import { AlertIcon, ExternalIcon } from './icons';

// Where to fix a lineup: the platform's own page for your team, when it has one.
function lineupUrl(league: LeagueSummary): string | null {
  if (league.platform === 'sleeper') return `https://sleeper.com/leagues/${league.leagueId}/team`;
  if (league.platform === 'espn') {
    return `https://fantasy.espn.com/football/team?leagueId=${league.leagueId}&teamId=${league.myTeamId}`;
  }
  return null;
}

function describe(alert: LineupAlert, league: string) {
  return alert.playerName
    ? `${alert.playerName} (${alert.detail}) starts at ${alert.slot} in ${league}`
    : `${alert.detail} in ${league}`;
}

// Lineup problems you can still fix, across every league, each with the best
// healthy bench player who could fill in. Alerts about players whose games
// have started are filtered out by the API.
export function AlertList({ leagues }: { leagues: LeagueSummary[] }) {
  const items = leagues.flatMap((league) => league.alerts.map((alert, i) => ({ league, alert, key: `${league.leagueId}:${i}` })));
  if (items.length === 0) return null;

  return (
    <section aria-label="Lineup alerts" className="mb-4">
      <ul className="flex flex-col gap-2">
        {items.map(({ league, alert, key }) => {
          const serious = alert.reason === 'empty' || ['Out', 'IR', 'Doubtful', 'Suspended'].includes(alert.detail);
          const url = lineupUrl(league);
          return (
            <li
              key={key}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-4 py-2.5 text-sm ${
                serious ? 'border-rose-800 bg-rose-950/50' : 'border-amber-800 bg-amber-950/40'
              }`}
            >
              <div className="min-w-0">
                <p className={`flex items-center gap-2 font-medium ${serious ? 'text-rose-200' : 'text-amber-200'}`}>
                  <AlertIcon className="shrink-0" />
                  {describe(alert, league.name)}
                </p>
                <p className="pl-6 text-xs text-slate-300">
                  {alert.suggestion
                    ? `${alert.suggestion.playerName} (${alert.suggestion.position}) is healthy on your bench and hasn't played yet` +
                      (alert.suggestion.projected != null ? ` · projected ${alert.suggestion.projected.toFixed(1)} in PPR` : '')
                    : "No bench player who's healthy and hasn't played yet can fill this slot."}
                </p>
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-1 pl-6 text-xs font-medium hover:underline sm:pl-0 ${serious ? 'text-rose-200' : 'text-amber-200'}`}
                >
                  Open {PLATFORM_LABEL[league.platform]}
                  <ExternalIcon />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
