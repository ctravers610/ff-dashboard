// The live feed's core, as pure functions: compare two snapshots of the week
// and turn every player whose fantasy-relevant numbers changed into an event,
// worth whatever that change is in each league by that league's own rules.

import type { LiveEventLeague, Player } from '@ffd/shared';
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

// Stat changes worth describing, in the order they read best.
const READABLE: [key: string, one: string, many: string][] = [
  ['pass_td', 'pass TD', 'pass TDs'],
  ['pass_yd', 'pass yd', 'pass yds'],
  ['pass_int', 'INT thrown', 'INTs thrown'],
  ['rush_td', 'rush TD', 'rush TDs'],
  ['rush_yd', 'rush yd', 'rush yds'],
  ['rec', 'catch', 'catches'],
  ['rec_td', 'rec TD', 'rec TDs'],
  ['rec_yd', 'rec yd', 'rec yds'],
  ['fum_lost', 'fumble lost', 'fumbles lost'],
  ['pass_2pt', '2-pt pass', '2-pt passes'],
  ['rush_2pt', '2-pt run', '2-pt runs'],
  ['rec_2pt', '2-pt catch', '2-pt catches'],
  ['fgm', 'FG made', 'FGs made'],
  ['fgmiss', 'FG missed', 'FGs missed'],
  ['xpm', 'PAT', 'PATs'],
  ['xpmiss', 'PAT missed', 'PATs missed'],
  ['sack', 'sack', 'sacks'],
  ['int', 'INT', 'INTs'],
  ['fum_rec', 'fumble recovery', 'fumble recoveries'],
  ['def_td', 'defensive TD', 'defensive TDs'],
  ['def_st_td', 'return TD', 'return TDs'],
  ['safe', 'safety', 'safeties'],
];

/** "1 catch, 14 rec yds" from the change in a stat line. */
export function describeChange(before: Stats, after: Stats): string {
  const parts: string[] = [];
  for (const [key, one, many] of READABLE) {
    const delta = Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 10) / 10;
    if (delta === 0) continue;
    const label = Math.abs(delta) === 1 ? one : many;
    parts.push(`${delta > 0 ? '' : '−'}${Math.abs(delta)} ${label}`); // a negative is a stat correction
  }
  return parts.join(', ');
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
