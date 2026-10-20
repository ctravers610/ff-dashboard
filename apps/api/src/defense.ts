// GET /api/defense: how many PPR points each NFL defense has allowed per game
// to each position this season, from every finished game's stat lines. The
// start/sit compare uses it to weigh a player's projection by his matchup.

import type { DefenseResponse } from '@ffd/shared';
import { sleeperClient } from './adapters/sleeper/client.js';
import { toPlayer } from './adapters/sleeper/mapper.js';
import { cached, HOUR } from './cache.js';
import { nflGames } from './scoring/games.js';
import { fetchStats } from './scoring/live.js';
import { scoreWithSettings } from './scoring/projection.js';

export const DEFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Plain PPR, the same for every defense, so they can be compared.
const PPR: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
  rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One player's points in one game, against the defense he faced. */
export interface GameAgainst {
  game: string; // "6:BUF-MIA"
  defense: string;
  position: string;
  points: number;
}

/** Per-game averages and ranks from every game's totals. Pure. */
export function defenseTable(lines: GameAgainst[]): DefenseResponse {
  // defense -> position -> points allowed, and the games they came in.
  const totals = new Map<string, Map<string, { points: number; games: Set<string> }>>();
  for (const l of lines) {
    const byPos = totals.get(l.defense) ?? new Map<string, { points: number; games: Set<string> }>();
    const t = byPos.get(l.position) ?? { points: 0, games: new Set<string>() };
    t.points += l.points;
    t.games.add(l.game);
    byPos.set(l.position, t);
    totals.set(l.defense, byPos);
  }
  const teams: DefenseResponse['teams'] = {};
  const leagueAverage: Record<string, number> = {};
  const games = new Set(lines.map((l) => l.game)).size;
  for (const pos of DEFENSE_POSITIONS) {
    const perGame = [...totals].flatMap(([defense, byPos]) => {
      const t = byPos.get(pos);
      return t && t.games.size ? [{ defense, allowed: t.points / t.games.size }] : [];
    });
    perGame.sort((a, b) => b.allowed - a.allowed);
    perGame.forEach((d, i) => {
      teams[d.defense] = { ...teams[d.defense], [pos]: { allowed: round1(d.allowed), rank: i + 1 } };
    });
    leagueAverage[pos] = perGame.length ? round1(perGame.reduce((n, d) => n + d.allowed, 0) / perGame.length) : 0;
  }
  return { games, leagueAverage, teams };
}

// A finished week's lines don't change.
const statsFor = (season: string, week: number) => cached(`defense:stats:${season}:${week}`, 6 * HOUR, () => fetchStats(season, week));

export const getDefense = () =>
  cached('defense', HOUR, async (): Promise<DefenseResponse> => {
    const state = await sleeperClient.state();
    const players = await sleeperClient.players();
    const lines: GameAgainst[] = [];
    for (let week = 1; week <= state.week; week++) {
      const [games, stats] = await Promise.all([nflGames(state.season, week).catch(() => null), statsFor(state.season, week).catch(() => null)]);
      if (!games || !stats) continue;
      for (const [id, s] of stats) {
        const p = toPlayer(id, players);
        const game = p?.nflTeam ? games.get(p.nflTeam) : undefined;
        // Only finished games count, so this week's are added as they end.
        if (!p || !game || game.progress < 1 || !DEFENSE_POSITIONS.includes(p.position)) continue;
        const points = scoreWithSettings(s, PPR);
        if (points !== 0) lines.push({ defense: game.opponent, position: p.position, points, game: `${week}:${[p.nflTeam, game.opponent].sort().join('-')}` });
      }
    }
    return defenseTable(lines);
  });
