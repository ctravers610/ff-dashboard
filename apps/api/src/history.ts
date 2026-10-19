import type { HistoryWeek, LeagueHistory, Platform, WeekResult } from '@ffd/shared';
import type { SnapshotRow } from './db/schema.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function weekResult(row: SnapshotRow, currentWeek: number): WeekResult {
  if (row.week >= currentWeek) return 'live';
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

    const finished = weeks.filter((w) => w.result !== 'live');
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
