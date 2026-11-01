// The live feed's core, as pure functions: compare two snapshots of the week
// and turn every player whose fantasy-relevant numbers changed into an event,
// worth whatever that change is in each league by that league's own rules.

import { describeStats, LIVE_STATS, type LiveEventLeague, type Player } from '@ffd/shared';
import type { GameScore } from '../scoring/games.js';

type Stats = Record<string, number>;

/** Everything a league's scoring can depend on, at one moment. */
export interface Snapshot {
  stats: Map<string, Stats>; // Sleeper's live stat lines, by Sleeper player id
  games: Map<string, GameScore>; // for defenses' points allowed
  platformPoints: Map<string, number>; // ESPN's and Yahoo's own totals, by `${leagueId}:${playerId}`
}

/** One place a player appears this week, and how that league scores him. */
export interface Appearance extends Omit<LiveEventLeague, 'points'> {
  pointsFor: (snapshot: Snapshot) => number | null;
}

export interface TrackedPlayer {
  sleeperId: string | null; // null when he couldn't be matched to Sleeper's stats
  player: Player;
  appearances: Appearance[];
}

/** "1 catch, 14 rec yds" from the change in a stat line. */
export function describeChange(before: Stats, after: Stats): string {
  const changes: Stats = {};
  for (const [key] of LIVE_STATS) changes[key] = Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 10) / 10;
  return describeStats(changes);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface FeedEvent {
  player: Player;
  description: string;
  leagues: LiveEventLeague[];
}

/** Every tracked player whose stats or points changed between two snapshots. */
export function diffSnapshots(before: Snapshot, after: Snapshot, tracked: TrackedPlayer[]): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const t of tracked) {
    const statsBefore = (t.sleeperId && before.stats.get(t.sleeperId)) || {};
    const statsAfter = (t.sleeperId && after.stats.get(t.sleeperId)) || {};
    const description = describeChange(statsBefore, statsAfter);

    const leagues = t.appearances.map(({ pointsFor, ...rest }) => {
      const was = pointsFor(before);
      const now = pointsFor(after);
      return { ...rest, points: was == null || now == null ? null : round1(now - was) };
    });
    const pointsMoved = leagues.some((l) => l.points != null && l.points !== 0);
    if (!description && !pointsMoved) continue;

    events.push({
      player: t.player,
      // Points can move with no new stats: ESPN or Yahoo catching up, or a defense's points allowed.
      description: description || (t.player.position === 'DEF' ? 'points allowed changed' : 'scoring update'),
      // Stats moved but a league shows no change yet: that platform hasn't caught up.
      leagues: leagues.map((l) => (description && l.points === 0 && (l.platform === 'espn' || l.platform === 'yahoo') ? { ...l, points: null } : l)),
    });
  }
  return events;
}
