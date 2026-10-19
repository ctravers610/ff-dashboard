import {
  convertFfpcPage,
  looksLikeFfpcPage,
  type LeagueSummary,
  type ManualLeague,
  type ManualMatchupSide,
  type MatchupSide,
  type RosterEntry,
  type SourceError,
  type StarterSlot,
} from '@ffd/shared';
import { liveScorer, type LiveScorer } from '../../scoring/live.js';
import { FFPC_RULES } from '../../scoring/rules.js';
import { buildAlerts, buildAllPlay, totalSide } from '../common.js';
import { sleeperClient } from '../sleeper/client.js';
import type { AdapterResult } from '../types.js';
import { buildPlayerIndex, parseRosterText, resolvePlayer, statusForSlot, type PlayerIndex } from './parse.js';
import { manualLeagueRepo } from './store.js';

// FFPC's week 6 is an all-play week every season: the top half of the league's
// weekly scores win, the bottom half lose.
const FFPC_ALL_PLAY_WEEKS = [6];

export function toManualSummary(
  league: ManualLeague,
  index: PlayerIndex,
  nfl: { season: string; week: number },
  scorer: LiveScorer | null = null, // when given, replaces snapshot points with live ones
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
  const toSide = (side: ManualMatchupSide, teamId: string): MatchupSide => {
    const slots = side.starters.map((s): StarterSlot => {
      // Reuse the roster parser so slots and names are normalized the same way.
      const line = parseRosterText(`${s.slot} ${s.name}`)[0] ?? { slot: s.slot, name: s.name };
      const player = resolvePlayer(line, index);
      if (!player) unmatched.push(s.name);
      const live = scorer && player ? scorer(player) : null;
      return { slot: line.slot ?? s.slot, player, points: live?.points ?? s.points, projected: live?.projected ?? null };
    });
    if (!scorer) {
      // No live feed: show the pasted totals, including FFPC's own projection.
      return { teamId, teamName: side.teamName, points: side.points, projected: side.projected ?? null, starters: slots };
    }
    return { teamId, teamName: side.teamName, ...totalSide(slots), starters: slots };
  };
  const me = snapshot ? toSide(snapshot.me, 'me') : null;
  const opponent = snapshot ? toSide(snapshot.opponent, 'opponent') : null;
  const allPlay =
    snapshot?.scoreboard && me && FFPC_ALL_PLAY_WEEKS.includes(snapshot.week)
      ? buildAllPlay(snapshot.scoreboard, me, opponent)
      : null;

  return {
    leagueId: league.id,
    platform: league.platform,
    account: 'manual',
    // Shown by your team name: FFPC tournaments share a name ("Big Gorilla
    // Tourney #104790", "#104979"), so the team is what tells them apart.
    name: league.teamName || league.name,
    season: nfl.season,
    week: nfl.week,
    myTeamId: 'me',
    standings: [],
    matchup: snapshot && me ? { week: snapshot.week, me, opponent, allPlay } : null,
    alerts: buildAlerts(starters),
    roster,
    manual: {
      leagueName: league.name,
      teamName: league.teamName,
      updatedAt: league.updatedAt,
      unmatched: [...new Set(unmatched)],
      matchupCapturedAt: snapshot?.capturedAt ?? null,
      liveScored: snapshot != null && scorer != null,
    },
  };
}

export async function fetchManualLeagues(nfl: { season: string; week: number }): Promise<AdapterResult> {
  const leagues = await manualLeagueRepo.list();
  if (leagues.length === 0) return { leagues: [], errors: [] };
  const errors: SourceError[] = [];
  try {
    const index = buildPlayerIndex(await sleeperClient.players());

    // Live scoring is a bonus: if the stat feeds are down, fall back to the pasted snapshot.
    let scorer: LiveScorer | null = null;
    if (leagues.some((l) => l.matchup?.week === nfl.week)) {
      scorer = await liveScorer(nfl.season, nfl.week, FFPC_RULES).catch((e: unknown) => {
        errors.push({ source: 'live-scoring', message: `Showing pasted scores: ${e instanceof Error ? e.message : e}` });
        return null;
      });
    }
    return { leagues: leagues.map((l) => toManualSummary(l, index, nfl, scorer)), errors };
  } catch (e) {
    return { leagues: [], errors: [{ source: 'manual', message: e instanceof Error ? e.message : String(e) }] };
  }
}
