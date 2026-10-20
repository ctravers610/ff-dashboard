// How a trade has worked out, with numbers. For each side: the points its new
// players scored in its starting lineup, above what a replacement-level player
// at the same position scored that week (the best one who'd be left if every
// team filled its starting slots), plus what they're projected to add the rest
// of the season. The difference in wins uses the matchup model: with a 25-point
// weekly spread for each team, a point is worth about 1/89 of a win.
// Pure functions: the loaders in index.ts gather the weeks.

import { canPlay, type TradeReport, type TradeSide, type TradedPlayer } from '@ffd/shared';
import { WEEKLY_SD } from '../outlook/model.js';

// d(win chance)/d(margin) at an even matchup: φ(0) / σ of the difference of two scores.
export const POINTS_PER_WIN = (WEEKLY_SD * Math.SQRT2) / 0.3989422804;

const round1 = (n: number) => Math.round(n * 10) / 10;

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

export interface SideInput {
  teamName: string;
  isMe: boolean;
  received: Acquired[];
  picks: string[];
  faab: number;
}

/** Replacement level for one week: per position, the score of the first player past the league's starters. */
export function replacementLevel(scores: { position: string; points: number }[], slots: string[], teams: number): Map<string, number> {
  const positions = [...new Set(scores.map((s) => s.position))];
  const out = new Map<string, number>();
  for (const pos of positions) {
    // Slots only this position can fill, plus an equal share of the flexible ones.
    const own = slots.filter((s) => canPlay(s, pos) && positions.filter((p) => canPlay(s, p)).length === 1).length;
    const shared = slots
      .filter((s) => canPlay(s, pos) && positions.filter((p) => canPlay(s, p)).length > 1)
      .reduce((n, s) => n + 1 / positions.filter((p) => canPlay(s, p)).length, 0);
    const starters = Math.round(teams * (own + shared));
    const ranked = scores.filter((s) => s.position === pos).sort((a, b) => b.points - a.points);
    out.set(pos, ranked[starters]?.points ?? 0);
  }
  return out;
}

function playerLine(p: Acquired, replacement: (week: number, position: string) => number): TradedPlayer {
  let points = 0;
  let started = 0;
  let over = 0;
  let startedWeeks = 0;
  let rosterWeeks = 0;
  for (const [week, w] of p.weeks) {
    if (!w.onRoster) continue;
    rosterWeeks++;
    points += w.points;
    if (w.started) {
      startedWeeks++;
      started += w.points;
      over += w.points - replacement(week, p.position);
    }
  }
  return {
    name: p.name,
    position: p.position,
    points: round1(points),
    started: round1(started),
    startedWeeks,
    rosterWeeks,
    overReplacement: round1(over),
    restOfSeason: p.restOfSeason == null ? null : round1(p.restOfSeason),
  };
}

const names = (side: TradeSide) => {
  const list = [...side.received.map((p) => p.name), ...side.picks, ...(side.faab ? [`$${side.faab} FAAB`] : [])];
  return list.length <= 1 ? (list[0] ?? 'nothing') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
};

// The roast for a lopsided trade: picked by size, and by a detail when there's a good one.
export function roast(winner: TradeSide, loser: TradeSide, margin: number, wins: number, final: boolean): string | null {
  if (margin < 25) return null;
  const benchwarmers = loser.received.filter((p) => p.rosterWeeks >= 2 && p.startedWeeks === 0);
  const star = [...winner.received].sort((a, b) => b.overReplacement - a.overReplacement)[0];
  const winsText = `${wins.toFixed(1)} win${wins.toFixed(1) === '1.0' ? '' : 's'}`;
  if (benchwarmers.length) {
    return `${loser.teamName} traded for ${benchwarmers.map((p) => p.name).join(' and ')} and has started them zero times. ${winner.teamName} is ${margin.toFixed(0)} points to the good${final ? '' : ' and counting'}.`;
  }
  if (margin >= 80 && star) {
    return `Daylight robbery: ${loser.teamName} handed over ${star.name} for ${names(loser)}. That's ${margin.toFixed(0)} points over replacement and about ${winsText} ${final ? 'gone for good' : 'so far'}.`;
  }
  return `${winner.teamName} fleeced ${loser.teamName}: ${margin.toFixed(0)} points over replacement, about ${winsText}${final ? ' over the season' : ' so far'}.`;
}

/** One trade, both sides scored; the winner first. */
export function analyzeTrade(
  id: string,
  week: number,
  sides: [SideInput, SideInput],
  replacement: (week: number, position: string) => number,
  final: boolean,
): TradeReport {
  const scored: TradeSide[] = sides.map((s) => {
    const received = s.received.map((p) => playerLine(p, replacement));
    return {
      teamName: s.teamName,
      isMe: s.isMe,
      received,
      picks: s.picks,
      faab: s.faab,
      overReplacement: round1(received.reduce((n, p) => n + p.overReplacement, 0)),
      restOfSeason: round1(received.reduce((n, p) => n + (p.restOfSeason ?? 0), 0)),
    };
  });
  // Ranked by what has actually happened; the projection is reported alongside, not mixed in.
  const [a, b] = [...scored].sort((x, y) => y.overReplacement - x.overReplacement) as [TradeSide, TradeSide];
  const margin = round1(a.overReplacement - b.overReplacement);
  const winsSwung = round1(margin / POINTS_PER_WIN);
  const projectedGap = round1(a.restOfSeason - b.restOfSeason);

  let verdict: string;
  if (margin < 10) verdict = final ? 'Even trade: neither side came out ahead.' : 'Even so far.';
  else verdict = `${a.teamName} ${final ? 'won' : 'is winning'} by ${margin.toFixed(1)} started points over replacement (about ${winsSwung.toFixed(1)} wins).`;
  if (!final && Math.abs(projectedGap) >= 10) {
    const ahead = projectedGap > 0 ? a : b;
    verdict += ` Rest of season, ${ahead.teamName}'s side projects ${Math.abs(projectedGap).toFixed(0)} more points.`;
  }
  return { id, week, sides: [a, b], margin, winsSwung, final, verdict, roast: roast(a, b, margin, winsSwung, final) };
}
