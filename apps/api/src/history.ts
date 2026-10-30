import { easternTime, type HistoryWeek, type LeagueHistory, type Platform, type WeekResult } from '@ffd/shared';
import type { SnapshotRow } from './db/schema.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// When a week's scores are final: 9 AM Eastern on the Tuesday after Monday
// night's game. Week 1 opens the Thursday after Labor Day (the first Monday in
// September), so week N ends N weeks and a day after Labor Day.
export function weekEndsAt(season: string, week: number): Date {
  const year = Number(season);
  const laborDay = 1 + ((8 - new Date(Date.UTC(year, 8, 1)).getUTCDay()) % 7);
  const tuesday = new Date(Date.UTC(year, 8, laborDay + 1 + 7 * week)); // rolls into later months
  return easternTime(tuesday.getUTCFullYear(), tuesday.getUTCMonth() + 1, tuesday.getUTCDate(), 9, 0);
}

// Whether a finished week's row can be graded. A row captured before the week
// ended holds whatever the score was then (0-0 before kickoff, Sunday night's
// partial total); Sleeper and ESPN weeks get refetched (backfill.ts), FFPC's
// can't be. And 0-0 means nothing was played, not a tie.
export function isFinal(row: SnapshotRow): boolean {
  if (row.capturedAt < weekEndsAt(row.season, row.week)) return false;
  return !(row.points === 0 && !row.opponentPoints);
}

export function weekResult(row: SnapshotRow, currentWeek: number): WeekResult {
  if (row.week >= currentWeek) return 'live';
  if (!isFinal(row)) return null;
  // All-play week: the top half of the league wins.
  if (row.allPlayRank != null && row.allPlayWinSlots != null) {
    return row.allPlayRank <= row.allPlayWinSlots ? 'win' : 'loss';
  }
  if (row.opponentPoints == null) return null;
  if (row.points > row.opponentPoints) return 'win';
  if (row.points < row.opponentPoints) return 'loss';
  return 'tie';
}

export function buildHistory(rows: SnapshotRow[], currentWeek: number): LeagueHistory[] {
  const byLeague = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = `${row.platform}:${row.leagueId}`;
    byLeague.set(key, [...(byLeague.get(key) ?? []), row]);
  }

  return [...byLeague.values()].map((leagueRows) => {
    const sorted = [...leagueRows].sort((a, b) => a.week - b.week);
    const latest = sorted[sorted.length - 1]!;
    const weeks: HistoryWeek[] = sorted.map((r) => ({
      week: r.week,
      points: r.points,
      projected: r.projected,
      opponentName: r.opponentName,
      opponentPoints: r.opponentPoints,
      result: weekResult(r, currentWeek),
      allPlay:
        r.allPlayRank != null && r.allPlayTeams != null && r.allPlayWinSlots != null
          ? { rank: r.allPlayRank, teams: r.allPlayTeams, winSlots: r.allPlayWinSlots }
          : null,
      capturedAt: r.capturedAt.toISOString(),
    }));

    // Ungraded weeks stay listed but don't count: their points aren't the final ones.
    const finished = weeks.filter((w, i) => w.result !== 'live' && isFinal(sorted[i]!));
    const count = (r: WeekResult) => finished.filter((w) => w.result === r).length;
    return {
      platform: latest.platform as Platform,
      leagueId: latest.leagueId,
      name: latest.leagueName,
      weeks,
      record: { wins: count('win'), losses: count('loss'), ties: count('tie') },
      avgPoints: finished.length ? round2(finished.reduce((sum, w) => sum + w.points, 0) / finished.length) : null,
    };
  });
}
