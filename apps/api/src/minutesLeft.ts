// PMR (player minutes remaining), the way FFPC's Live Scoring page counts it:
// every starter's game is 60 minutes, ticking down as it's played.

import type { LeagueSummary, MatchupSide } from '@ffd/shared';
import type { GameScore } from './scoring/games.js';

export function minutesLeft(side: MatchupSide, games: Map<string, GameScore>): number {
  let minutes = 0;
  for (const s of side.starters) {
    const team = s.player?.nflTeam;
    const game = team ? games.get(team) : undefined;
    if (!game) continue; // empty slot, or a bye: no minutes to come
    minutes += 60 * (1 - game.progress);
  }
  return Math.round(minutes);
}

/** Adds PMR to both sides of this week's matchups. A pasted (FFPC) matchup from another week is left alone. */
export function withMinutesLeft(leagues: LeagueSummary[], week: number, games: Map<string, GameScore> | null): LeagueSummary[] {
  if (!games) return leagues;
  return leagues.map((l) => {
    const m = l.matchup;
    if (!m || m.week !== week) return l;
    return {
      ...l,
      matchup: {
        ...m,
        me: { ...m.me, minutesLeft: minutesLeft(m.me, games) },
        opponent: m.opponent ? { ...m.opponent, minutesLeft: minutesLeft(m.opponent, games) } : null,
      },
    };
  });
}
