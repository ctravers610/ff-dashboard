// The season model behind playoff odds and opponent previews: each team's
// scoring so far, pulled toward the league average while the sample is small,
// with the same week-to-week spread as the win probability on the matchups.
// Pure, with a seeded random source, so results are repeatable and testable.

import { normalCdf } from '@ffd/shared';

export interface SeasonTeam {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  results: ('W' | 'L' | 'T')[]; // finished weeks, oldest first
}

export interface Game {
  week: number;
  a: string; // team ids
  b: string;
}

/** A league's regular season: the teams, the games left, and how many make the playoffs. */
export interface LeagueSeason {
  teams: SeasonTeam[];
  remaining: Game[];
  playoffTeams: number | null;
  // The league also scores each team against the weekly median: the top half
  // that week get an extra win (Sleeper's "league average match").
  medianGames?: boolean;
}

// One team's score in one week varies by about this much (the matchup model's full-week spread).
export const WEEKLY_SD = 25;
// Early on, a team's average is mostly noise: count the league average as this many extra games.
const PRIOR_GAMES = 3;

const games = (t: SeasonTeam) => t.wins + t.losses + t.ties;

/** Each team's expected weekly score: its own average, shrunk toward the league's. */
export function strengths(teams: SeasonTeam[]): Map<string, number> {
  const played = teams.reduce((n, t) => n + games(t), 0);
  const league = played ? teams.reduce((n, t) => n + t.pointsFor, 0) / played : 100;
  return new Map(teams.map((t) => [t.teamId, (t.pointsFor + PRIOR_GAMES * league) / (games(t) + PRIOR_GAMES)]));
}

/** Chance team a outscores team b in a week. */
export function headToHead(a: number, b: number): number {
  return normalCdf((a - b) / (WEEKLY_SD * Math.SQRT2));
}

/** Standings order: most wins (a tie counts half), then most points. */
export const standingsOrder = (a: { wins: number; ties: number; pointsFor: number }, b: { wins: number; ties: number; pointsFor: number }) =>
  b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor;

// mulberry32: a small, fast, seedable generator.
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plays the rest of the regular season many times over. Returns each team's
 * chance of finishing in a playoff spot and its average final win total.
 */
export function simulate(season: LeagueSeason, runs = 5000, seed = 1): Map<string, { playoffChance: number; projectedWins: number }> {
  const strength = strengths(season.teams);
  const rand = random(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const spots = season.playoffTeams ?? 0;
  const made = new Map(season.teams.map((t) => [t.teamId, 0]));
  const winsTotal = new Map(season.teams.map((t) => [t.teamId, 0]));

  const weeks = [...new Set(season.remaining.map((g) => g.week))];
  for (let r = 0; r < runs; r++) {
    const table = new Map(season.teams.map((t) => [t.teamId, { id: t.teamId, wins: t.wins, ties: t.ties, pointsFor: t.pointsFor }]));
    for (const week of weeks) {
      // Each team scores once a week; that score plays its game and the median.
      const score = new Map(season.teams.map((t) => [t.teamId, strength.get(t.teamId)! + WEEKLY_SD * normal()]));
      for (const t of table.values()) t.pointsFor += score.get(t.id)!;
      for (const g of season.remaining) {
        if (g.week !== week || !table.has(g.a) || !table.has(g.b)) continue;
        table.get(score.get(g.a)! > score.get(g.b)! ? g.a : g.b)!.wins++;
      }
      if (season.medianGames) {
        const top = [...score.entries()].sort((x, y) => y[1] - x[1]).slice(0, Math.floor(score.size / 2));
        for (const [id] of top) table.get(id)!.wins++;
      }
    }
    const order = [...table.values()].sort(standingsOrder);
    order.forEach((t, i) => {
      if (i < spots) made.set(t.id, made.get(t.id)! + 1);
      winsTotal.set(t.id, winsTotal.get(t.id)! + t.wins);
    });
  }
  return new Map(
    season.teams.map((t) => [t.teamId, { playoffChance: made.get(t.teamId)! / runs, projectedWins: winsTotal.get(t.teamId)! / runs }]),
  );
}
