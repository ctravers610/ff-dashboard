// Re-scores finished FFPC weeks from their pasted lineups. FFPC has no history
// API, so a week last captured before it ended (or never captured) is rebuilt
// from the paste's starters and that week's NFL stats.

import type { LeagueSummary, ManualLeague, ManualMatchup } from '@ffd/shared';
import type { NewSnapshot } from '../../db/schema.js';
import { weekEndsAt } from '../../history.js';
import { nflGames, type GameScore } from '../../scoring/games.js';
import { liveScorer, type LiveScorer } from '../../scoring/live.js';
import { FFPC_RULES } from '../../scoring/rules.js';
import { toSnapshot } from '../../snapshots.js';
import { sleeperClient } from '../sleeper/client.js';
import { toManualSummary } from './index.js';
import { buildPlayerIndex, type PlayerIndex } from './parse.js';
import { manualLeagueRepo } from './store.js';

// Pastes worth re-scoring: finished weeks without a final score (`stale`, from
// weeksToFetch), and ones pasted again since their row was written, such as a
// final page for last week pasted this week.
export function pastesToRescore(
  pastes: ManualMatchup[],
  stale: number[],
  captures: { week: number; capturedAt: Date }[],
  currentWeek: number,
): ManualMatchup[] {
  return pastes.filter((p) => {
    if (p.week >= currentWeek) return false;
    if (stale.includes(p.week)) return true;
    const capture = captures.find((c) => c.week === p.week);
    return !capture || new Date(p.capturedAt) > capture.capturedAt;
  });
}

// Pure: one pasted week scored from final stats, as my snapshot row.
//
// The paste is a lineup at one moment, and FFPC allows late swaps: a starter can
// be replaced until his game kicks off. So the row is graded as exact only when
// every starter on both sides had kicked off by the time of the paste; otherwise
// it's the app's estimate. An all-play week pasted before it ended is an
// estimate too: only my matchup's two lineups can be re-scored, and the other
// teams' totals are as pasted, so FFPC's projection for them stands in for the
// final score.
export function rescoreWeek(
  league: ManualLeague,
  paste: ManualMatchup,
  season: string,
  index: PlayerIndex,
  scorer: LiveScorer,
  games: Map<string, GameScore>,
): NewSnapshot | null {
  const pastedAt = new Date(paste.capturedAt);
  const weekOver = pastedAt >= weekEndsAt(season, paste.week);
  const scoreboard = weekOver ? paste.scoreboard : paste.scoreboard?.map((t) => ({ ...t, points: t.projected ?? t.points }));

  const summary = toManualSummary({ ...league, matchup: { ...paste, scoreboard } }, index, { season, week: paste.week }, scorer);
  const row = toSnapshot(summary);
  const m = summary.matchup;
  if (!row || !m) return null;

  const locked = [m.me, m.opponent].every((side) =>
    (side?.starters ?? []).every(({ player }) => {
      // Sleeper keys team defenses by team code, e.g. "SEA".
      const kickoff = player ? games.get(player.nflTeam ?? player.playerId)?.kickoff : null;
      return kickoff != null && new Date(kickoff) <= pastedAt; // no game (a bye): he could have been swapped out
    }),
  );
  return { ...row, estimated: !locked || (m.allPlay != null && !weekOver) };
}

export async function ffpcPastWeeks(
  league: LeagueSummary,
  stale: number[],
  captures: { week: number; capturedAt: Date }[],
  store = manualLeagueRepo,
): Promise<NewSnapshot[]> {
  const manual = (await store.list()).find((l) => l.id === league.leagueId);
  if (!manual) return [];
  const pastes = pastesToRescore(await store.matchupWeeks(league.leagueId, league.season), stale, captures, league.week);
  if (pastes.length === 0) return [];

  const index = buildPlayerIndex(await sleeperClient.players());
  const rows = await Promise.all(
    pastes.map(async (paste) => {
      const [scorer, games] = await Promise.all([
        liveScorer(league.season, paste.week, FFPC_RULES),
        nflGames(league.season, paste.week),
      ]);
      return rescoreWeek(manual, paste, league.season, index, scorer, games);
    }),
  );
  return rows.filter((r): r is NewSnapshot => r != null);
}
