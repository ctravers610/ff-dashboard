// Turns raw lineup alerts into advice you can act on: an alert about a player
// whose game has already kicked off is dropped (the lineup is locked, so it's
// only noise), and every remaining problem gets the best healthy bench player
// who could still fill that slot.

import { canPlay, type BenchSuggestion, type LeagueSummary, type LineupAlert, type Player } from '@ffd/shared';
import { sleeperClient } from './adapters/sleeper/client.js';
import { toPlayer } from './adapters/sleeper/mapper.js';
import { playerKey } from './exposure.js';
import { nflGames, type GameScore } from './scoring/games.js';
import { scoreWithSettings, weeklyProjections } from './scoring/projection.js';

export { canPlay }; // slot eligibility lives in @ffd/shared, so the web app uses the same rules

export interface AdviceContext {
  /** This week's games by NFL team, or null if the scoreboard is unavailable. */
  games: Map<string, GameScore> | null;
  /** A neutral projection for ranking bench players; null when unknown. */
  projectedFor: (player: Player) => number | null;
}

type GameState = 'upcoming' | 'started' | 'bye' | 'unknown';
function gameState(player: Player, games: AdviceContext['games']): GameState {
  if (!games || !player.nflTeam) return 'unknown';
  const game = games.get(player.nflTeam);
  if (!game) return 'bye';
  return game.started ? 'started' : 'upcoming';
}

export function adviseLeague(league: LeagueSummary, ctx: AdviceContext): LineupAlert[] {
  const rosterById = new Map(league.roster.map((r) => [r.player.playerId, r.player]));
  const used = new Set<string>(); // one bench player is suggested for at most one slot

  const bestFor = (slot: string): BenchSuggestion | null => {
    const candidates = league.roster
      .filter((r) => r.status === 'bench' && !r.player.injuryStatus && !used.has(r.player.playerId))
      .map((r) => r.player)
      .filter((p) => canPlay(slot, p.position))
      // A bench player whose game started, or who is on a bye, can't help now.
      .filter((p) => ['upcoming', 'unknown'].includes(gameState(p, ctx.games)))
      .map((p) => ({ player: p, projected: ctx.projectedFor(p) }))
      .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1));
    const best = candidates[0];
    if (!best) return null;
    used.add(best.player.playerId);
    return { playerName: best.player.name, position: best.player.position, projected: best.projected };
  };

  // A starter whose team has no game this week scores nothing: flag it like an injury.
  const byes: LineupAlert[] = (league.matchup?.me.starters ?? []).flatMap((s) =>
    s.player && gameState(s.player, ctx.games) === 'bye' && !league.alerts.some((a) => a.playerId === s.player!.playerId)
      ? [{ slot: s.slot, playerId: s.player.playerId, playerName: s.player.name, reason: 'bye' as const, detail: 'On bye' }]
      : [],
  );

  const advice: LineupAlert[] = [];
  for (const alert of [...league.alerts, ...byes]) {
    const starter = alert.playerId ? rosterById.get(alert.playerId) : undefined;
    if (starter && gameState(starter, ctx.games) === 'started') continue;
    advice.push({ ...alert, suggestion: bestFor(alert.slot) });
  }
  return advice;
}

// Points per stat for a plain PPR league. Only used to rank bench players
// when Sleeper's own pts_ppr figure is missing.
const PPR: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6,
  rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2, fgm: 3, xpm: 1,
};

/** This week's games and neutral projections; null before the season starts. */
export async function loadWeekContext(nfl: { season: string; week: number }): Promise<AdviceContext | null> {
  if (nfl.week <= 0) return null;

  // Advice is a bonus: if a feed is down, alerts still show, just without it.
  const [games, projections, players] = await Promise.all([
    nflGames(nfl.season, nfl.week).catch(() => null),
    weeklyProjections(nfl.season, nfl.week).catch(() => null),
    sleeperClient.players().catch(() => null),
  ]);

  // Platforms use different player ids, so projections are matched by position and name.
  const byKey = new Map<string, number>();
  if (projections && players) {
    for (const [id, stats] of projections) {
      const player = toPlayer(id, players);
      if (player) byKey.set(playerKey(player), stats.pts_ppr ?? scoreWithSettings(stats, PPR));
    }
  }
  return { games, projectedFor: (p) => byKey.get(playerKey(p)) ?? null };
}

/** Advises every league; without this week's context the alerts are left as they are. */
export function adviseLeagues(leagues: LeagueSummary[], ctx: AdviceContext | null): LeagueSummary[] {
  return ctx ? leagues.map((l) => ({ ...l, alerts: adviseLeague(l, ctx) })) : leagues;
}
