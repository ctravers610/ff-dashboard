// Merges every league's roster and current opponent into one list per real
// player, so you can see your exposure to a player across all platforms.

import type { LeagueRef, LeagueSummary, Player, PlayerExposure } from '@ffd/shared';

const NAME_SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b/g;

// Platforms use different player ids, so identity is position + normalized
// name ("A.J. Brown Jr." → "ajbrown"); team defenses are keyed by NFL team.
export function playerKey(p: Player): string {
  if (p.position === 'DEF') return `DEF:${p.nflTeam ?? p.name}`;
  const name = p.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[.'’-]/g, '')
    .replace(NAME_SUFFIXES, '')
    .replace(/[^a-z]/g, '');
  return `${p.position}:${name}`;
}

const STATUS_ORDER = { starter: 0, bench: 1, ir: 2 } as const;

export function buildExposure(leagues: LeagueSummary[]): PlayerExposure[] {
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
  for (const e of result) e.owned.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  // Most-owned first, then most-started, then most-faced, then alphabetical.
  return result.sort(
    (a, b) =>
      b.owned.length - a.owned.length ||
      starts(b) - starts(a) ||
      b.facing.length - a.facing.length ||
      a.player.name.localeCompare(b.player.name),
  );
}
