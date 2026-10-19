// The pre-kickoff lineup check: problems in your starting lineups, each
// reminded about 90 minutes before it's too late to fix (11:30 AM for the
// 1 PM games). Pure functions; the scheduler in server.ts sends the result.

import type { LeagueSummary, LineupAlert } from '@ffd/shared';
import type { GameScore } from '../scoring/games.js';

const LEAD_MS = 90 * 60 * 1000;
// Statuses that mean he almost certainly won't play. A Questionable starter
// only counts when there's a healthy bench player to swap in.
const OUT = new Set(['Out', 'IR', 'Doubtful', 'Suspended', 'PUP']);

export interface LineupIssue {
  key: string; // stable across checks, so each issue is sent once
  leagueName: string;
  alert: LineupAlert;
  remindAt: Date;
  deadline: Date; // after this, the lineup spot is locked
}

const needsAttention = (a: LineupAlert) =>
  a.reason === 'empty' || a.reason === 'bye' || (a.detail != null && OUT.has(a.detail)) || (a.detail === 'Questionable' && a.suggestion != null);

/**
 * Every lineup problem worth a reminder this week. An injured starter is due
 * before his own game; a bye or an empty slot before the week's first game,
 * since any later game's player could fill it.
 */
export function lineupIssues(leagues: LeagueSummary[], games: Map<string, GameScore>, season: string, week: number): LineupIssue[] {
  const kickoffs = [...games.values()].flatMap((g) => (g.kickoff ? [new Date(g.kickoff).getTime()] : []));
  if (kickoffs.length === 0) return []; // no schedule: can't time anything
  const first = Math.min(...kickoffs);
  const last = Math.max(...kickoffs);

  return leagues.flatMap((league) => {
    const teamOf = new Map(league.roster.map((r) => [r.player.playerId, r.player.nflTeam]));
    return league.alerts.filter(needsAttention).flatMap((alert): LineupIssue[] => {
      const team = alert.playerId ? teamOf.get(alert.playerId) : null;
      const own = team ? games.get(team)?.kickoff : null;
      const anyGame = alert.reason === 'empty' || alert.reason === 'bye' || !own;
      const basis = anyGame ? first : new Date(own!).getTime();
      return [
        {
          key: `lineup:${season}:${week}:${league.platform}:${league.leagueId}:${alert.slot}:${alert.playerId ?? 'empty'}:${alert.reason}`,
          leagueName: league.name,
          alert,
          remindAt: new Date(basis - LEAD_MS),
          deadline: new Date(anyGame ? last : basis),
        },
      ];
    });
  });
}

/** Issues whose reminder time has come, that can still be fixed, and haven't been sent. */
export const dueLineupIssues = (issues: LineupIssue[], sent: Set<string>, now: Date) =>
  issues.filter((i) => now >= i.remindAt && now < i.deadline && !sent.has(i.key));

function line({ leagueName, alert }: LineupIssue): string {
  const who = alert.playerName ?? `Empty ${alert.slot} slot`;
  const what = alert.reason === 'bye' ? 'is on bye' : alert.reason === 'empty' ? '' : `is ${alert.detail}`;
  const swap = alert.suggestion ? `: start ${alert.suggestion.playerName}?` : '';
  return `${leagueName}: ${who}${what ? ` ${what}` : ''}${swap}`;
}

/** One notification for everything due at once, most urgent first. */
export function lineupMessage(due: LineupIssue[]) {
  const sorted = [...due].sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const lines = sorted.slice(0, 4).map(line);
  if (sorted.length > 4) lines.push(`and ${sorted.length - 4} more`);
  return {
    title: `Lineup check: ${due.length} starter${due.length > 1 ? 's' : ''} to fix`,
    body: lines.join('\n'),
    url: '/?view=matchups',
    tag: 'lineup',
  };
}
