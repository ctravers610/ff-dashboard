// Rebuilds weeks that already finished from Sleeper's matchup history.

import type { LeagueSummary } from '@ffd/shared';
import type { NewSnapshot } from '../../db/schema.js';
import { sleeperClient } from './client.js';
import type { SleeperMatchup } from './types.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Pure: turns one week's matchups into my snapshot row, or null if I had no game.
export function pastWeekSnapshot(
  league: LeagueSummary,
  week: number,
  matchups: SleeperMatchup[],
): NewSnapshot | null {
  const mine = matchups.find((m) => String(m.roster_id) === league.myTeamId);
  if (!mine || mine.matchup_id == null) return null; // bye / league not started
  const theirs = matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
  const teamName = (rosterId?: number) =>
    rosterId == null ? null : (league.standings.find((t) => t.teamId === String(rosterId))?.teamName ?? null);

  return {
    platform: 'sleeper',
    leagueId: league.leagueId,
    leagueName: league.name,
    season: league.season,
    week,
    points: round2(mine.points ?? 0),
    opponentName: teamName(theirs?.roster_id),
    opponentPoints: theirs ? round2(theirs.points ?? 0) : null,
  };
}

export async function sleeperPastWeeks(league: LeagueSummary, weeks: number[]): Promise<NewSnapshot[]> {
  const rows = await Promise.all(
    weeks.map(async (week) => pastWeekSnapshot(league, week, await sleeperClient.matchups(league.leagueId, week))),
  );
  return rows.filter((r): r is NewSnapshot => r != null);
}
