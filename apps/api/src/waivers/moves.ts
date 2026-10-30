// Platform-neutral waiver logic: which week a claim plays in, which available
// players are worth listing, and which add/drop moves would help your lineup.

import type { Player, WaiverMove, WaiverMoveReason, WaiverPlayer } from '@ffd/shared';
import { canPlay } from '../lineupAdvice.js';
import type { GameScore } from '../scoring/games.js';

export const LAST_REGULAR_WEEK = 18;

/**
 * The week a claim made now would play in: this week until its first game
 * kicks off, then next week (waivers run after the week's games).
 */
export function claimWeek(nflWeek: number, thisWeeksGames: Map<string, GameScore> | null): number {
  const started = thisWeeksGames ? [...thisWeeksGames.values()].some((g) => g.started) : true;
  return started ? nflWeek + 1 : nflWeek;
}

const BAD_STATUS = new Set(['Out', 'IR', 'Doubtful', 'Suspended', 'PUP']);
const value = (p: WaiverPlayer | null | undefined, key: 'week' | 'restOfSeason') => p?.[key] ?? 0;

/** Positions a league can start, from its lineup slots (FLEX adds RB, WR and TE, and so on). */
export function startablePositions(slots: string[]): Set<string> {
  const all = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  return new Set(all.filter((pos) => slots.some((slot) => canPlay(slot, pos))));
}

/**
 * The available players worth showing: at each position, the best by this
 * week's projection and the best for the rest of the season.
 */
export function pickAvailable(players: WaiverPlayer[], positions: Set<string>, perPosition = 12): WaiverPlayer[] {
  const keep = new Set<WaiverPlayer>();
  for (const pos of positions) {
    const atPos = players.filter((p) => p.player.position === pos || (pos === 'DEF' && p.player.position === 'D/ST'));
    for (const key of ['week', 'restOfSeason'] as const) {
      [...atPos].sort((a, b) => value(b, key) - value(a, key)).slice(0, perPosition).forEach((p) => keep.add(p));
    }
  }
  return [...keep];
}

export interface MoveInput {
  starters: { slot: string; player: WaiverPlayer | null }[];
  bench: WaiverPlayer[]; // not counting injured reserve
  available: WaiverPlayer[];
  openRosterSpots: number;
  byeTeams: Set<string> | null; // NFL teams without a game in the claim week; null if unknown
}

export type Lineup = Pick<MoveInput, 'starters' | 'bench'>;

// An upgrade has to be worth at least this many projected points to be worth a claim.
export const UPGRADE_THRESHOLD = 3;
const MAX_MOVES = 3;

export function problem(player: Player | null, byeTeams: Set<string> | null): WaiverMoveReason | null {
  if (!player) return 'empty';
  if (player.nflTeam && byeTeams?.has(player.nflTeam)) return 'bye';
  if (player.injuryStatus && BAD_STATUS.has(player.injuryStatus)) return 'injury';
  return null;
}

/**
 * Suggests up to three add/drop moves, biggest gain first. A slot only gets a
 * move if no one on your bench already covers it.
 *
 * Who to drop uses value over replacement: points mean different things at
 * different positions (a defense outscores a running back), so a bench player
 * is only a safe drop when someone at least as good at his own position is
 * still available, or when he plays the same position as, and is worth less
 * than, the player being added.
 */
export function suggestMoves({ starters, bench, available, openRosterSpots, byeTeams }: MoveInput): WaiverMove[] {
  const playable = (p: WaiverPlayer) => problem(p.player, byeTeams) == null;
  const candidates: WaiverMove[] = [];
  const usedBench = new Set<WaiverPlayer>();
  const usedAdds = new Set<WaiverPlayer>();

  // Worst slots first, so the scarce good free agents go where they help most.
  const slots = starters
    .map((s) => ({ ...s, reason: problem(s.player?.player ?? null, byeTeams) }))
    .map((s) => ({ ...s, current: s.reason ? 0 : value(s.player, 'week') }))
    .sort((a, b) => a.current - b.current);

  for (const { slot, player, reason, current } of slots) {
    // The best you can already field here: the starter, or a healthy bench player.
    const benchOption = bench
      .filter((b) => !usedBench.has(b) && canPlay(slot, b.player.position) && playable(b))
      .sort((a, b) => value(b, 'week') - value(a, 'week'))[0];
    const fielded = Math.max(current, value(benchOption, 'week'));
    if (benchOption && value(benchOption, 'week') > current) usedBench.add(benchOption);

    const add = available
      .filter((a) => !usedAdds.has(a) && canPlay(slot, a.player.position) && playable(a))
      .sort((a, b) => value(b, 'week') - value(a, 'week'))[0];
    if (!add) continue;
    const gain = value(add, 'week') - fielded;
    if (gain < (reason ? 0.1 : UPGRADE_THRESHOLD)) continue;

    usedAdds.add(add);
    candidates.push({ slot, reason: reason ?? 'upgrade', replaces: player, add, drop: null, gain: Math.round(gain * 10) / 10 });
  }

  // Each position's replacement level: the best rest-of-season value still available there.
  const replacement = new Map<string, number>();
  for (const a of available) {
    const pos = a.player.position;
    replacement.set(pos, Math.max(replacement.get(pos) ?? 0, value(a, 'restOfSeason')));
  }
  const overReplacement = (b: WaiverPlayer) => value(b, 'restOfSeason') - (replacement.get(b.player.position) ?? 0);

  // Pay for the biggest gains first: with open spots, then by dropping the most replaceable bench players.
  candidates.sort((a, b) => b.gain - a.gain);
  const moves: WaiverMove[] = [];
  let open = openRosterSpots;
  const dropped = new Set<WaiverPlayer>();
  for (const move of candidates) {
    if (moves.length === MAX_MOVES) break;
    if (open > 0) {
      open--;
      moves.push(move);
      continue;
    }
    const sameSpotCheaper = (b: WaiverPlayer) =>
      b.player.position === move.add.player.position && value(b, 'restOfSeason') < value(move.add, 'restOfSeason');
    const drop = bench
      .filter((b) => !dropped.has(b) && !usedBench.has(b) && (overReplacement(b) <= 0 || sameSpotCheaper(b)))
      .sort((a, b) => overReplacement(a) - overReplacement(b))[0];
    if (!drop) continue;
    dropped.add(drop);
    moves.push({ ...move, drop });
  }
  return moves;
}
