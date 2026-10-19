import {
  convertFfpcPage,
  looksLikeFfpcPage,
  type LeagueSummary,
  type ManualLeague,
  type ManualMatchupSide,
  type MatchupSide,
  type RosterEntry,
  type StarterSlot,
} from '@ffd/shared';
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

  // Accept a raw FFPC page too, in case it was saved without being converted.
  const text = looksLikeFfpcPage(league.rosterText) ? convertFfpcPage(league.rosterText).rosterText : league.rosterText;

  for (const line of parseRosterText(text)) {
    const player = resolvePlayer(line, index);
    if (!player) {
      unmatched.push(line.name);
      continue;
    }
    const status = statusForSlot(line.slot);
    roster.push({ player, status });
    if (status === 'starter') starters.push({ slot: line.slot ?? player.position, player, points: 0 });
  }

  // A pasted matchup is only shown during the week it was captured.
  const snapshot = league.matchup?.week === nfl.week ? league.matchup : null;
  const toSide = (side: ManualMatchupSide, teamId: string): MatchupSide => ({
    teamId,
    teamName: side.teamName,
    points: side.points,
    starters: side.starters.map((s) => {
      // Reuse the roster parser so slots and names are normalized the same way.
      const line = parseRosterText(`${s.slot} ${s.name}`)[0] ?? { slot: s.slot, name: s.name };
      const player = resolvePlayer(line, index);
      if (!player) unmatched.push(s.name);
      return { slot: line.slot ?? s.slot, player, points: s.points };
    }),
  });

  return {
    leagueId: league.id,
    platform: league.platform,
    account: 'manual',
    name: league.name,
    season: nfl.season,
    week: nfl.week,
    myTeamId: 'me',
    standings: [],
    matchup: snapshot
      ? { week: snapshot.week, me: toSide(snapshot.me, 'me'), opponent: toSide(snapshot.opponent, 'opponent') }
      : null,
    alerts: buildAlerts(starters),
    roster,
    manual: {
      teamName: league.teamName,
      updatedAt: league.updatedAt,
      unmatched: [...new Set(unmatched)],
      matchupCapturedAt: snapshot?.capturedAt ?? null,
    },
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
