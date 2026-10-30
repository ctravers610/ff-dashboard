// Rebuilds weeks that already finished from your team's Yahoo schedule.

import type { LeagueSummary } from '@ffd/shared';
import type { NewSnapshot } from '../../db/schema.js';
import { yahooGet } from './client.js';
import { parseMatchups, type YahooMatchup } from './parse.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Pure: my snapshot row for each requested week that has been played.
export function pastWeekSnapshots(matchups: YahooMatchup[], summary: LeagueSummary, weeks: number[]): NewSnapshot[] {
  return matchups
    .filter((m) => weeks.includes(m.week) && m.status === 'postevent')
    .map((m) => ({
      platform: 'yahoo',
      leagueId: summary.leagueId,
      leagueName: summary.name,
      season: summary.season,
      week: m.week,
      points: round2(m.me.points),
      opponentName: m.opponent?.teamName ?? null,
      opponentPoints: m.opponent ? round2(m.opponent.points) : null,
    }));
}

export async function yahooPastWeeks(summary: LeagueSummary, weeks: number[]): Promise<NewSnapshot[]> {
  const json = await yahooGet(`team/${summary.myTeamId}/matchups`);
  return pastWeekSnapshots(parseMatchups(json, summary.myTeamId), summary, weeks);
}
