// How a trade has worked out, with numbers. Each finished week since the trade,
// a team's actual lineup is compared with the one it would have had without it:
// the same starters minus the players it got, with the players it gave up back
// in wherever that week's projections favored them. Projections decide, not the
// points scored, so a backup who happened to outscore the starter counts for
// nothing, in hindsight, on either side. Ahead, both lineups are chosen and
// scored on projections. A flipped game is one that would have gone the other way.
// Pure functions: the loaders in index.ts and yahoo.ts gather the weeks.

import type { TradeFlip, TradeReport, TradeSide, TradedPlayer } from '@ffd/shared';
import { bestLineup } from '../recap/lineup.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

// Above any projection: a starter with no projection stays, and the bench only fills slots nobody else can.
const KEEP = 1000;

export interface LineupPlayer {
  id: string;
  position: string;
  points: number;
  projected: number | null; // that week, league scoring; null if unknown
  started: boolean;
}

export interface TeamWeek {
  players: LineupPlayer[];
  score: number;
  opponent: { id: string; name: string; score: number } | null;
}

/** Points in the lineup chosen by `rank`. */
function lineupPoints<T extends { position: string }>(slots: string[], players: T[], rank: (p: T) => number, points: (p: T) => number): number {
  const candidates = players.map((p) => ({ source: p, player: { position: p.position }, points: rank(p) }));
  return bestLineup(slots, candidates).reduce((n, s) => n + (s.pick ? points(s.pick.source) : 0), 0);
}

/** What the trade did for a lineup in a finished week: its actual points minus the lineup it would have had. */
export function weekGain(slots: string[], players: LineupPlayer[], received: Set<string>, gaveUp: Omit<LineupPlayer, 'started'>[]): number {
  const onTeam = new Set(players.map((p) => p.id));
  // Someone back on the team has already been counted, and someone projected for nothing (a bye, an injury) wouldn't have started.
  const back = gaveUp.filter((p) => !onTeam.has(p.id) && p.projected !== 0).map((p) => ({ ...p, rank: p.projected ?? 0 }));
  if (back.length === 0 && !players.some((p) => received.has(p.id))) return 0;

  const kept = players.filter((p) => !received.has(p.id)).map((p) => ({ ...p, rank: p.started ? (p.projected ?? KEEP) : (p.projected ?? 0) - KEEP }));
  const without = lineupPoints(slots, [...kept, ...back], (p) => p.rank, (p) => p.points);
  return players.filter((p) => p.started).reduce((n, p) => n + p.points, 0) - without;
}

/** The same for a week ahead: the best projected lineup with the trade, minus the best without it. */
export function projectedWeekGain(slots: string[], roster: { id: string; position: string; projected: number | null }[], received: Set<string>, gaveUp: { id: string; position: string; projected: number | null }[]): number {
  const onTeam = new Set(roster.map((p) => p.id));
  const without = [...roster.filter((p) => !received.has(p.id)), ...gaveUp.filter((p) => !onTeam.has(p.id))];
  const score = (players: typeof roster) => lineupPoints(slots, players, (p) => p.projected ?? 0, (p) => p.projected ?? 0);
  return score(roster) - score(without);
}

export interface WeekLine {
  points: number;
  onRoster: boolean; // on the receiving team that week
  started: boolean;
}

export interface Acquired {
  name: string;
  position: string;
  weeks: Map<number, WeekLine>; // from the trade week on
  restOfSeason: number | null;
}

export interface SideWeek {
  week: number;
  gain: number;
  score: number;
  opponent: TeamWeek['opponent'];
}

export interface SideInput {
  teamId: string;
  teamName: string;
  isMe: boolean;
  received: Acquired[];
  picks: string[];
  faab: number;
  weeks: SideWeek[];
  projectedGain: number;
}

/** What a loader knows about a league's season. */
export interface LeagueWeeks {
  slots: string[];
  finished: number[]; // since the first trade
  left: number[]; // the rest of the regular season
  final: boolean;
  teamWeek: (week: number, teamId: string) => TeamWeek | null;
  tradedPlayer: (week: number, id: string) => { points: number; projected: number | null };
  rosterAhead: (week: number, teamId: string) => { id: string; position: string; projected: number | null }[];
}

export interface TradeMove {
  id: string;
  name: string;
  position: string;
  toTeamId: string;
}

/** One team's side of a trade, from who moved where. */
export function tradeSide(team: { id: string; name: string; isMe: boolean }, moves: TradeMove[], tradeWeek: number, league: LeagueWeeks, extras: { picks: string[]; faab: number } = { picks: [], faab: 0 }): SideInput {
  const mine = moves.filter((m) => m.toTeamId === team.id);
  const gone = moves.filter((m) => m.toTeamId !== team.id);
  const received = new Set(mine.map((m) => m.id));
  const weeks = league.finished.filter((w) => w >= tradeWeek);

  return {
    teamId: team.id,
    teamName: team.name,
    isMe: team.isMe,
    received: mine.map((m) => ({
      name: m.name,
      position: m.position,
      weeks: new Map(
        weeks.map((w) => {
          const line = league.teamWeek(w, team.id)?.players.find((p) => p.id === m.id);
          return [w, { points: line?.points ?? league.tradedPlayer(w, m.id).points, onRoster: line != null, started: line?.started ?? false }];
        }),
      ),
      // Raw points to come, if he's still on the team; what they mean for the lineup is projectedGain.
      restOfSeason:
        league.final || league.left.length === 0 || !league.rosterAhead(league.left[0]!, team.id).some((p) => p.id === m.id)
          ? null
          : league.left.reduce((n, w) => n + (league.tradedPlayer(w, m.id).projected ?? 0), 0),
    })),
    picks: extras.picks,
    faab: extras.faab,
    weeks: weeks.flatMap((w) => {
      const week = league.teamWeek(w, team.id);
      if (!week) return [];
      const gaveUp = gone.map((m) => ({ id: m.id, position: m.position, ...league.tradedPlayer(w, m.id) }));
      return [{ week: w, gain: weekGain(league.slots, week.players, received, gaveUp), score: week.score, opponent: week.opponent }];
    }),
    projectedGain: league.final
      ? 0
      : league.left.reduce((n, w) => {
          const gaveUp = gone.map((m) => ({ id: m.id, position: m.position, projected: league.tradedPlayer(w, m.id).projected }));
          return n + projectedWeekGain(league.slots, league.rosterAhead(w, team.id), received, gaveUp);
        }, 0),
  };
}

function playerLine(p: Acquired): TradedPlayer {
  let points = 0;
  let started = 0;
  let startedWeeks = 0;
  let rosterWeeks = 0;
  for (const w of p.weeks.values()) {
    if (!w.onRoster) continue;
    rosterWeeks++;
    points += w.points;
    if (w.started) {
      startedWeeks++;
      started += w.points;
    }
  }
  return { name: p.name, position: p.position, points: round1(points), started: round1(started), startedWeeks, rosterWeeks, restOfSeason: p.restOfSeason == null ? null : round1(p.restOfSeason) };
}

/** Games the trade changed for this side. Both trade partners playing each other counts both ways. A tie either way isn't a flip. */
export function flips(side: SideInput, other: SideInput): TradeFlip[] {
  return side.weeks.flatMap((w): TradeFlip[] => {
    if (!w.opponent) return [];
    const theirGain = w.opponent.id === other.teamId ? (other.weeks.find((o) => o.week === w.week)?.gain ?? 0) : 0;
    const actual = w.score - w.opponent.score;
    const without = w.score - w.gain - (w.opponent.score - theirGain);
    if (actual > 0 && without < 0) return [{ week: w.week, opponent: w.opponent.name, won: true }];
    if (actual < 0 && without > 0) return [{ week: w.week, opponent: w.opponent.name, won: false }];
    return [];
  });
}

const netWins = (side: TradeSide) => side.flips.reduce((n, f) => n + (f.won ? 1 : -1), 0);
const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;
// The side ahead on points came out behind in the games the trade changed.
const resultsDisagree = (winner: TradeSide, loser: TradeSide) => netWins(loser) > netWins(winner);

const names = (side: TradeSide) => {
  const list = [...side.received.map((p) => p.name), ...side.picks, ...(side.faab ? [`$${side.faab} FAAB`] : [])];
  return list.length <= 1 ? (list[0] ?? 'nothing') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
};

// The roast for a lopsided trade: picked by size, and by a detail when there's a good one.
export function roast(winner: TradeSide, loser: TradeSide, margin: number, final: boolean): string | null {
  if (margin < 25 || resultsDisagree(winner, loser)) return null;
  const benchwarmers = loser.received.filter((p) => p.rosterWeeks >= 2 && p.startedWeeks === 0);
  const star = [...winner.received].sort((a, b) => b.started - a.started)[0];
  const costly = loser.flips.find((f) => !f.won);
  if (benchwarmers.length) {
    return `${loser.teamName} traded for ${benchwarmers.map((p) => p.name).join(' and ')} and has started them zero times. ${winner.teamName} is ${margin.toFixed(0)} points to the good${final ? '' : ' and counting'}.`;
  }
  if (costly && star) {
    return `${loser.teamName} handed over ${star.name} and it cost them week ${costly.week} against ${costly.opponent}. ${winner.teamName} is ${margin.toFixed(0)} lineup points to the good${final ? '' : ' and counting'}.`;
  }
  if (margin >= 80 && star) {
    return `Daylight robbery: ${loser.teamName} handed over ${star.name} for ${names(loser)}. That's ${margin.toFixed(0)} lineup points ${final ? 'gone for good' : 'so far'}.`;
  }
  return `${winner.teamName} fleeced ${loser.teamName}: ${margin.toFixed(0)} lineup points${final ? ' over the season' : ' so far'}.`;
}

/** One trade, both sides scored; the winner first. */
export function analyzeTrade(id: string, week: number, sides: [SideInput, SideInput], final: boolean): TradeReport {
  const scored = sides.map((s, i): TradeSide => ({
    teamName: s.teamName,
    isMe: s.isMe,
    received: s.received.map(playerLine),
    picks: s.picks,
    faab: s.faab,
    gain: round1(s.weeks.reduce((n, w) => n + w.gain, 0)),
    flips: flips(s, sides[1 - i]!),
    projectedGain: round1(s.projectedGain),
  }));
  // Ranked by what has actually happened; the projection is reported alongside, not mixed in.
  const [a, b] = [...scored].sort((x, y) => y.gain - x.gain) as [TradeSide, TradeSide];
  const margin = round1(a.gain - b.gain);
  const projectedGap = round1(a.projectedGain - b.projectedGain);
  // A game between the two partners is on both sides' lists, and is one game.
  const flipped = a.flips.length + b.flips.filter((f) => f.opponent !== a.teamName).length;

  let verdict = margin < 10 ? (final ? 'Even trade: neither side came out ahead.' : 'Even so far.') : `${a.teamName} ${final ? 'won' : 'is winning'} by ${margin.toFixed(1)} lineup points.`;
  if (a.gain >= 10 && b.gain >= 10) verdict += ' Both lineups are better for it.';
  if (a.gain <= -10 && b.gain <= -10) verdict += ' Both lineups are worse for it.';
  if (flipped > 0) verdict += margin >= 10 && resultsDisagree(a, b) ? ` But the results favor ${b.teamName}: it has flipped ${games(flipped)}.` : ` It has flipped ${games(flipped)}.`;
  if (!final && Math.abs(projectedGap) >= 10) {
    const ahead = projectedGap > 0 ? a : b;
    verdict += ` Rest of season, ${ahead.teamName} projects to gain ${Math.abs(projectedGap).toFixed(0)} more lineup points.`;
  }
  return { id, week, sides: [a, b], margin, winsSwung: netWins(a) - netWins(b), final, verdict, roast: roast(a, b, margin, final) };
}
