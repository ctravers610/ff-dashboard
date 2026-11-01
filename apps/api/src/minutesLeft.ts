// How far along each starter's game is: where it stands, and PMR (player minutes
// remaining), the way FFPC's Live Scoring page counts it: every starter's game is
// 60 minutes, ticking down as it's played.

import type { LeagueSummary, MatchupSide, Player, StarterGame } from '@ffd/shared';
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

/** A starter's game, or null with no player to look up. A team missing from a known schedule is on bye. */
export function starterGame(player: Player | null, games: Map<string, GameScore>): StarterGame | null {
  if (!player?.nflTeam) return null;
  const game = games.get(player.nflTeam);
  if (!game) return { state: 'bye', clock: null, kickoff: null };
  const state = !game.started ? 'pre' : game.progress >= 1 ? 'final' : 'live';
  return { state, clock: game.clock ?? null, kickoff: game.kickoff };
}

function withGames(side: MatchupSide, games: Map<string, GameScore>): MatchupSide {
  return { ...side, minutesLeft: minutesLeft(side, games), starters: side.starters.map((s) => ({ ...s, game: starterGame(s.player, games) })) };
}

/** Adds PMR and each starter's game to both sides of this week's matchups. A pasted (FFPC) matchup from another week is left alone. */
export function withGameProgress(leagues: LeagueSummary[], week: number, games: Map<string, GameScore> | null): LeagueSummary[] {
  if (!games || games.size === 0) return leagues; // no schedule: can't tell
  return leagues.map((l) => {
    const m = l.matchup;
    if (!m || m.week !== week) return l;
    return { ...l, matchup: { ...m, me: withGames(m.me, games), opponent: m.opponent ? withGames(m.opponent, games) : null } };
  });
}
