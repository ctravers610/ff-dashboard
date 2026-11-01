// Live projections for Yahoo matchups, as the Sleeper adapter makes them: a
// starter's points so far plus his Sleeper projection for the share of his game
// left, scored with the league's own Yahoo scoring. Yahoo has no projections of
// its own to update, so they're Sleeper's, matched by playerKey like waivers.

import type { Player } from '@ffd/shared';
import { playerKey } from '../../exposure.js';
import { byes, type GameScore } from '../../scoring/games.js';
import { liveProjection, scoreWithSettings } from '../../scoring/projection.js';
import type { Projector } from './parse.js';

/**
 * A projector for one league's scoring. A starter with no projection counts 0
 * if his team is on bye, and otherwise null: that side then keeps Yahoo's total.
 */
export function liveProjector(
  sleeperIds: Map<string, string>,
  projections: Map<string, Record<string, number>>,
  games: Map<string, GameScore>,
  scoring: Record<string, number>,
): Projector {
  const onBye = byes(games);
  return (player: Player, actual: number) => {
    const team = player.nflTeam ?? '';
    const id = sleeperIds.get(playerKey(player));
    const stats = id ? projections.get(id) : undefined;
    if (!stats) return onBye?.has(team) ? 0 : null;
    return liveProjection(actual, scoreWithSettings(stats, scoring), games.get(team)?.progress ?? 0);
  };
}
