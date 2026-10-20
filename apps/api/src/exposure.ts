// Merges every league's roster and current opponent into one list per real
// player, so you can see your exposure to a player across all platforms.

import type { LeagueRef, LeagueSummary, Player, PlayerExposure, PlayerGame } from '@ffd/shared';
import type { AdviceContext } from './lineupAdvice.js';

const NAME_SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b/g;

// "A.J. Brown Jr." → "ajbrown"
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[.'’-]/g, '')
    .replace(NAME_SUFFIXES, '')
    .replace(/[^a-z]/g, '');
}

// Platforms use different player ids, so identity is position + normalized
// name; team defenses are keyed by NFL team.
export function playerKey(p: Player): string {
  if (p.position === 'DEF') return `DEF:${p.nflTeam ?? p.name}`;
  return `${p.position}:${normalizeName(p.name)}`;
}

const STATUS_ORDER = { starter: 0, bench: 1, ir: 2 } as const;

// His game this week: null when the schedule is unknown, opponent null on a bye.
function gameFor(player: Player, games: AdviceContext['games']): PlayerGame | null {
  if (!games || !player.nflTeam) return null;
  const g = games.get(player.nflTeam);
  return g ? { opponent: g.opponent, kickoff: g.kickoff, started: g.started } : { opponent: null, kickoff: null, started: false };
}

/** One entry per real player; `week` adds each one's game and a neutral projection. */
export function buildExposure(leagues: LeagueSummary[], week?: AdviceContext | null): PlayerExposure[] {
  const byKey = new Map<string, PlayerExposure>();
  const entryFor = (player: Player) => {
    const key = playerKey(player);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, player, owned: [], facing: [] };
      byKey.set(key, entry);
    }
    // Prefer a version of the player that carries an injury status.
    if (!entry.player.injuryStatus && player.injuryStatus) entry.player = player;
    return entry;
  };

  for (const league of leagues) {
    const ref: LeagueRef = { leagueId: league.leagueId, leagueName: league.name, platform: league.platform };
    for (const { player, status } of league.roster) {
      entryFor(player).owned.push({ ...ref, status });
    }
    for (const slot of league.matchup?.opponent?.starters ?? []) {
      if (slot.player) entryFor(slot.player).facing.push(ref);
    }
  }

  const starts = (e: PlayerExposure) => e.owned.filter((o) => o.status === 'starter').length;
  const result = [...byKey.values()];
  for (const e of result) {
    e.owned.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    if (week) {
      e.game = gameFor(e.player, week.games);
      e.projected = week.projectedFor(e.player);
    }
  }

  // Most-owned first, then most-started, then most-faced, then alphabetical.
  return result.sort(
    (a, b) =>
      b.owned.length - a.owned.length ||
      starts(b) - starts(a) ||
      b.facing.length - a.facing.length ||
      a.player.name.localeCompare(b.player.name),
  );
}
