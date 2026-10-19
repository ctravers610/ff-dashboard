import type { LeagueSummary, ManualLeague, RosterEntry, StarterSlot } from '@ffd/shared';
import { buildAlerts } from '../common.js';
import { sleeperClient } from '../sleeper/client.js';
import type { AdapterResult } from '../types.js';
import { buildPlayerIndex, parseRosterText, resolvePlayer, statusForSlot, type PlayerIndex } from './parse.js';
import { listManualLeagues } from './store.js';

export function toManualSummary(
  league: ManualLeague,
  index: PlayerIndex,
  nfl: { season: string; week: number },
): LeagueSummary {
  const roster: RosterEntry[] = [];
  const starters: StarterSlot[] = [];
  const unmatched: string[] = [];

  for (const line of parseRosterText(league.rosterText)) {
    const player = resolvePlayer(line, index);
    if (!player) {
      unmatched.push(line.name);
      continue;
    }
    const status = statusForSlot(line.slot);
    roster.push({ player, status });
    if (status === 'starter') starters.push({ slot: line.slot ?? player.position, player, points: 0 });
  }

  return {
    leagueId: league.id,
    platform: league.platform,
    account: 'manual',
    name: league.name,
    season: nfl.season,
    week: nfl.week,
    myTeamId: 'me',
    standings: [],
    matchup: null,
    alerts: buildAlerts(starters),
    roster,
    manual: { teamName: league.teamName, updatedAt: league.updatedAt, unmatched },
  };
}

export async function fetchManualLeagues(nfl: { season: string; week: number }): Promise<AdapterResult> {
  const leagues = await listManualLeagues();
  if (leagues.length === 0) return { leagues: [], errors: [] };
  try {
    const index = buildPlayerIndex(await sleeperClient.players());
    return { leagues: leagues.map((l) => toManualSummary(l, index, nfl)), errors: [] };
  } catch (e) {
    return { leagues: [], errors: [{ source: 'manual', message: e instanceof Error ? e.message : String(e) }] };
  }
}
