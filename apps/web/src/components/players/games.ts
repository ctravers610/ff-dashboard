import type { PlayerExposure, PlayerGame } from '@ffd/shared';

// Which NFL game a player is in this week, as one key for both teams: "DAL–PHI".
// null on a bye or when the schedule is unknown.
export function gameKey(p: PlayerExposure): string | null {
  const team = p.player.nflTeam;
  const opp = p.game?.opponent;
  return team && opp ? [team, opp].sort().join('–') : null;
}

/** "Sun 1:00 PM ET", in the time zone the NFL schedules by. */
export function kickoffLabel(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return `${when} ET`;
}

/** "vs LAR · Sun 4:25 PM ET", "On bye", or null when the schedule is unknown. */
export function gameLabel(game: PlayerGame | null | undefined): string | null {
  if (!game) return null;
  if (!game.opponent) return 'On bye';
  const kickoff = kickoffLabel(game.kickoff);
  return `vs ${game.opponent}${game.started ? ' · underway or over' : kickoff ? ` · ${kickoff}` : ''}`;
}

export const starts = (p: PlayerExposure) => p.owned.filter((o) => o.status === 'starter').length;

export interface GameExposure {
  key: string;
  kickoff: string | null;
  started: boolean;
  starts: number; // your starting slots across every league
  against: number; // opponents' starters you face
}

/** Your starts and the starters you face in each NFL game, most-invested first; plus starters on bye. */
export function exposureByGame(players: PlayerExposure[]): { games: GameExposure[]; byeStarts: number } {
  const games = new Map<string, GameExposure>();
  let byeStarts = 0;
  for (const p of players) {
    if (p.game && !p.game.opponent) byeStarts += starts(p);
    const key = gameKey(p);
    if (!key) continue;
    const g = games.get(key) ?? { key, kickoff: p.game!.kickoff, started: p.game!.started, starts: 0, against: 0 };
    g.starts += starts(p);
    g.against += p.facing.length;
    games.set(key, g);
  }
  const list = [...games.values()]
    .filter((g) => g.starts + g.against > 0)
    .sort((a, b) => b.starts - a.starts || b.against - a.against || a.key.localeCompare(b.key));
  return { games: list, byeStarts };
}
