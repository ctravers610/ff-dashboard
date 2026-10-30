// Who the live feed watches, and how each league scores them: everyone on your
// rosters (starters and bench) plus whoever is starting against you this week.

import type { DashboardResponse, LeagueSummary, Player } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { playerKey } from '../exposure.js';
import { pointsAllowed } from '../scoring/live.js';
import { scoreWithSettings } from '../scoring/projection.js';
import { FFPC_RULES } from '../scoring/rules.js';
import { scoreStats } from '../scoring/score.js';
import { activeSources } from '../sources/store.js';
import type { Appearance, Snapshot, TrackedPlayer } from './feed.js';

type Role = Appearance['role'];

/** Each Sleeper league's scoring settings, by league id. */
async function sleeperScoring(season: string): Promise<Map<string, Record<string, number>>> {
  const { sleeperUsernames } = await activeSources();
  const out = new Map<string, Record<string, number>>();
  for (const username of sleeperUsernames) {
    const user = await sleeperClient.user(username).catch(() => null);
    if (!user?.user_id) continue;
    for (const league of await sleeperClient.leagues(user.user_id, season).catch(() => [])) {
      out.set(league.league_id, league.scoring_settings ?? {});
    }
  }
  return out;
}

/** How one league scores one player, read off a snapshot. */
function scorer(league: LeagueSummary, player: Player, sleeperId: string | null, settings: Map<string, Record<string, number>>): Appearance['pointsFor'] {
  if (league.platform === 'espn' || league.platform === 'yahoo') {
    return (snap) => snap.platformPoints.get(`${league.leagueId}:${player.playerId}`) ?? null;
  }
  if (!sleeperId) return () => null;
  if (league.platform === 'sleeper') {
    const scoring = settings.get(league.leagueId) ?? {};
    return (snap) => scoreWithSettings(snap.stats.get(sleeperId) ?? {}, scoring);
  }
  // FFPC (hand-entered leagues): FFPC's rules, with defenses' points allowed from the scoreboard.
  return (snap) => {
    const stats = snap.stats.get(sleeperId) ?? {};
    if (player.position !== 'DEF') return scoreStats(stats, player.position, FFPC_RULES);
    const game = snap.games.get(player.nflTeam ?? sleeperId);
    return scoreStats(stats, 'DEF', FFPC_RULES, pointsAllowed(game, game ? snap.stats.get(game.opponent) : undefined));
  };
}

/** Whether a dashboard error is about this league. Sleeper reports by account, which doesn't say which leagues it had, so any failing account counts. */
function reportsFailing(source: string, league: LeagueSummary): boolean {
  if (league.manual) return source === 'manual';
  if (league.platform === 'sleeper') return source.startsWith('sleeper:');
  return source === league.platform || source === `${league.platform}:${league.leagueId}`;
}

/** Leagues known from earlier in the week that didn't load this time because their source failed, not because they're gone. */
export function failingLeagues(dashboard: DashboardResponse, lastGood: LeagueSummary[]): LeagueSummary[] {
  const loaded = new Set(dashboard.leagues.map((l) => `${l.platform}:${l.leagueId}`));
  return lastGood.filter((l) => !loaded.has(`${l.platform}:${l.leagueId}`) && dashboard.errors.some((e) => reportsFailing(e.source, l)));
}

/** `failing` leagues are listed from their last good rosters, with points unknown until they load again. */
export async function trackedPlayers(dashboard: DashboardResponse, failing: LeagueSummary[] = []): Promise<TrackedPlayer[]> {
  const [players, settings] = await Promise.all([sleeperClient.players(), sleeperScoring(dashboard.season)]);

  // ESPN and Yahoo use their own player ids; match them to Sleeper's by position and name.
  const sleeperIdByKey = new Map<string, string>();
  for (const id of Object.keys(players)) {
    const p = toPlayer(id, players);
    if (p?.position) sleeperIdByKey.set(playerKey(p), id);
  }
  const sleeperIdOf = (league: LeagueSummary, p: Player) =>
    league.platform === 'espn' || league.platform === 'yahoo' ? (sleeperIdByKey.get(playerKey(p)) ?? null) : p.playerId;

  const byKey = new Map<string, TrackedPlayer>();
  const add = (league: LeagueSummary, player: Player, role: Role, scored: boolean) => {
    const sleeperId = sleeperIdOf(league, player);
    const key = sleeperId ?? playerKey(player);
    const entry = byKey.get(key) ?? { sleeperId, player, appearances: [] };
    const leagueKey = `${league.platform}:${league.leagueId}`;
    if (entry.appearances.some((a) => a.leagueKey === leagueKey)) return; // already counted, as a starter
    entry.appearances.push({ leagueKey, leagueName: league.name, platform: league.platform, role, pointsFor: scored ? scorer(league, player, sleeperId, settings) : () => null });
    byKey.set(key, entry);
  };
  const addLeague = (league: LeagueSummary, scored: boolean) => {
    for (const s of league.matchup?.me.starters ?? []) if (s.player) add(league, s.player, 'starter', scored);
    for (const r of league.roster) if (r.status !== 'starter') add(league, r.player, 'bench', scored);
    for (const s of league.matchup?.opponent?.starters ?? []) if (s.player) add(league, s.player, 'opponent', scored);
  };

  for (const league of dashboard.leagues) addLeague(league, true);
  for (const league of failing) addLeague(league, false);
  return [...byKey.values()];
}

/** ESPN's and Yahoo's own point totals for everyone in your matchups there, by `${leagueId}:${playerId}`. */
export function platformPoints(dashboard: DashboardResponse): Snapshot['platformPoints'] {
  const out = new Map<string, number>();
  for (const league of dashboard.leagues.filter((l) => l.platform === 'espn' || l.platform === 'yahoo')) {
    for (const side of [league.matchup?.me, league.matchup?.opponent]) {
      for (const s of side?.starters ?? []) if (s.player) out.set(`${league.leagueId}:${s.player.playerId}`, s.points);
    }
  }
  return out;
}
