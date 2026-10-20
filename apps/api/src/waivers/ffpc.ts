// Waivers for FFPC leagues, from a pasted copy of FFPC's add/drop page (FFPC
// has no API). This week's values are FFPC's own projections from the page;
// rest of season comes from Sleeper's weekly projections scored with FFPC's
// rules, the same engine as FFPC live scoring.

import { parseFfpcBidSchedule, parseFfpcWaivers, type FfpcWaiverPlayer, type InjuryStatus, type ManualLeague, type Player, type SourceError, type WaiverLeague, type WaiverPlayer } from '@ffd/shared';
import { buildPlayerIndex, parseRosterText, resolvePlayer, statusForSlot, type PlayerIndex } from '../adapters/manual/parse.js';
import { manualLeagueRepo } from '../adapters/manual/store.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { HOUR } from '../cache.js';
import { normalizeName } from '../exposure.js';
import { weeklyProjections } from '../scoring/projection.js';
import { FFPC_RULES } from '../scoring/rules.js';
import { scoreStats } from '../scoring/score.js';
import { waiverPlayer, type WaiverContext } from './context.js';
import { pickAvailable, startablePositions, suggestMoves } from './moves.js';

type Projections = Map<string, Record<string, number>>;

const INJURY: Record<string, InjuryStatus> = { Q: 'Questionable', D: 'Doubtful', O: 'Out', IR: 'IR', SUS: 'Suspended', PUP: 'PUP' };

// Sleeper ids for team defenses are the team code; FFPC writes Jacksonville as JAC.
const TEAM: Record<string, string> = { JAC: 'JAX' };

export interface FfpcPaste {
  text: string;
  capturedAt: Date;
}

/** One FFPC league's waiver view from its roster and its pasted add/drop page. */
export function ffpcWaiverLeague(
  league: ManualLeague,
  paste: FfpcPaste | null,
  index: PlayerIndex,
  weeks: Projections[], // claim week first, then each later week of the regular season
  ctx: WaiverContext,
): WaiverLeague {
  // Named by your team, as everywhere else in the app (see adapters/manual).
  const base = { leagueId: league.id, platform: 'ffpc' as const, name: league.teamName || league.name, moves: [], available: [], openRosterSpots: 0 };
  if (!paste) return { ...base, rules: null, pastedAt: null, runs: [], runsSource: null, claims: null };

  const page = parseFfpcWaivers(paste.text);
  const restOfSeason = (p: Player) => {
    if (p.playerId.startsWith('ffpc:')) return null; // not matched to Sleeper: no projections
    return weeks.reduce((sum, w) => {
      const stats = w.get(p.playerId);
      return sum + (stats ? scoreStats(stats, p.position, FFPC_RULES, stats.pts_allow ?? null) : 0);
    }, 0);
  };

  // FFPC's player, matched to Sleeper's so projections and trends line up across the app.
  const toPlayer = (fp: FfpcWaiverPlayer): Player => {
    const team = TEAM[fp.nflTeam] ?? fp.nflTeam;
    const name = fp.position === 'DEF' ? `${team} DST` : fp.name;
    const matched = resolvePlayer({ slot: fp.position, name }, index);
    // Sleeper's injury tag is live, while the paste's is frozen at the time it was
    // copied, so Sleeper's wins; the paste's only fills in for a player Sleeper doesn't know.
    if (matched) return matched;
    const injuryStatus = (fp.injury && INJURY[fp.injury]) || null;
    return { playerId: `ffpc:${fp.position}:${normalizeName(fp.name)}`, name: fp.name, position: fp.position, nflTeam: team, injuryStatus };
  };
  const toWaiver = (fp: FfpcWaiverPlayer) => {
    const player = toPlayer(fp);
    return waiverPlayer(player, fp.projected, restOfSeason(player), ctx);
  };

  const available = page.available.map(toWaiver);

  // Your lineup comes from the league's roster (set by the Live Scoring paste);
  // each player's projection from the add/drop page's roster table.
  const pageRoster = new Map(page.roster.map((fp) => [normalizeName(fp.name), fp]));
  const lines = parseRosterText(league.rosterText);
  const mine = lines.flatMap((line) => {
    const player = resolvePlayer(line, index);
    if (!player) return [];
    const fp = pageRoster.get(normalizeName(player.position === 'DEF' ? `${player.nflTeam} DST` : player.name));
    const status = statusForSlot(line.slot);
    return [{ slot: line.slot, status, wp: waiverPlayer(fp ? toPlayer(fp) : player, fp?.projected ?? null, restOfSeason(player), ctx) }];
  });
  const starters = mine.filter((m) => m.status === 'starter').map((m) => ({ slot: m.slot!, player: m.wp }));
  const bench = mine.filter((m) => m.status === 'bench').map((m) => m.wp);

  return {
    ...base,
    rules: { type: 'faab', faabLeft: page.faabLeft, faabTotal: null, priority: null, teams: page.teams ?? 0, schedule: page.bidSchedule },
    available: pickAvailable(available, startablePositions(starters.map((s) => s.slot))),
    // FFPC rosters are a fixed size and always full, so every add needs a drop.
    moves: suggestMoves({ starters, bench, available, openRosterSpots: 0, byeTeams: ctx.byeTeams }),
    pastedAt: paste.capturedAt.toISOString(),
    // FFPC says when bids process right on the page.
    runs: page.bidSchedule ? parseFfpcBidSchedule(page.bidSchedule) : [],
    runsSource: page.bidSchedule ? 'ffpc' : null,
    claims: null,
  };
}

export async function fetchFfpcWaivers(ctx: WaiverContext): Promise<{ leagues: WaiverLeague[]; errors: SourceError[] }> {
  try {
    const [leagues, pastes] = await Promise.all([manualLeagueRepo.list(), manualLeagueRepo.waiverPastes()]);
    if (leagues.length === 0) return { leagues: [], errors: [] };

    const weekNumbers = Array.from({ length: Math.max(0, ctx.lastWeek - ctx.week + 1) }, (_, i) => ctx.week + i);
    const [players, weeks] = await Promise.all([
      sleeperClient.players(),
      Promise.all(weekNumbers.map((w) => weeklyProjections(ctx.season, w, HOUR))),
    ]);
    const index = buildPlayerIndex(players);
    const byId = new Map(pastes.map((p) => [p.id, p]));
    return { leagues: leagues.map((l) => ffpcWaiverLeague(l, byId.get(l.id) ?? null, index, weeks, ctx)), errors: [] };
  } catch (e) {
    return { leagues: [], errors: [{ source: 'ffpc', message: e instanceof Error ? e.message : String(e) }] };
  }
}
