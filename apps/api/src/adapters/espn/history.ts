// Rebuilds weeks that already finished from the schedule in ESPN's league payload.

import type { LeagueSummary } from '@ffd/shared';
import type { NewSnapshot } from '../../db/schema.js';
import { espnClient, type EspnAuth } from './client.js';
import type { EspnLeague } from './types.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Pure: my snapshot row for each requested matchup period that I played.
export function pastWeekSnapshots(
  espn: EspnLeague,
  summary: LeagueSummary,
  weeks: number[],
): NewSnapshot[] {
  const myTeamId = Number(summary.myTeamId);
  const teamName = (id?: number) =>
    id == null ? null : (summary.standings.find((t) => t.teamId === String(id))?.teamName ?? null);

  const rows: NewSnapshot[] = [];
  for (const week of weeks) {
    const game = espn.schedule?.find(
      (g) => g.matchupPeriodId === week && (g.home?.teamId === myTeamId || g.away?.teamId === myTeamId),
    );
    if (!game) continue;
    const mine = game.home?.teamId === myTeamId ? game.home : game.away;
    const theirs = game.home?.teamId === myTeamId ? game.away : game.home;
    if (mine?.totalPoints == null) continue; // not scored (yet)
    rows.push({
      platform: 'espn',
      leagueId: summary.leagueId,
      leagueName: summary.name,
      season: summary.season,
      week,
      points: round2(mine.totalPoints),
      opponentName: teamName(theirs?.teamId),
      opponentPoints: theirs?.totalPoints != null ? round2(theirs.totalPoints) : null,
    });
  }
  return rows;
}

export async function espnPastWeeks(
  summary: LeagueSummary,
  weeks: number[],
  auth: EspnAuth | null,
): Promise<NewSnapshot[]> {
  const espn = await espnClient.league(summary.leagueId, summary.season, auth);
  return pastWeekSnapshots(espn, summary, weeks);
}
