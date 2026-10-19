// The platform-neutral data model. Every adapter (Sleeper, ESPN, Yahoo, FFPC)
// converts its own API responses into these shapes, so the web app never
// needs to know which platform a league came from.

export * from './ffpc';
export * from './ffpcLive';
export * from './ffpcWaivers';
export * from './waiverSchedule';

export type Platform ='sleeper' | 'espn' | 'yahoo' | 'ffpc';

export type InjuryStatus = 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'PUP' | 'Suspended' | null;

export interface Player {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: InjuryStatus;
}

export interface StarterSlot {
  slot: string; // roster position, e.g. "QB", "FLEX"
  player: Player | null; // null = empty slot
  points: number;
  projected?: number | null; // live projection: actual so far + projection for time remaining
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  ownerName: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}

export interface MatchupSide {
  teamId: string;
  teamName: string;
  points: number;
  projected?: number | null;
  starters: StarterSlot[];
}

// All-play week (e.g. FFPC week 6): you win by finishing in the top half of
// the league's weekly scores, not by beating one opponent.
export interface AllPlayTeam {
  teamName: string;
  points: number;
  projected: number | null;
  isMe: boolean;
  live: boolean; // false = score as of the last paste
}

export interface AllPlay {
  teams: AllPlayTeam[]; // sorted by points, highest first
  winSlots: number; // top N win
  myRank: number;
  myProjectedRank: number | null;
}

export interface Matchup {
  week: number;
  me: MatchupSide;
  opponent: MatchupSide | null; // null on a bye / median-only week
  allPlay?: AllPlay | null;
}

export type AlertReason = 'empty' | 'injury' | 'bye';

// A healthy bench player who could fill a slot with a problem.
export interface BenchSuggestion {
  playerName: string;
  position: string;
  projected: number | null; // Sleeper's PPR projection, for ranking only (not your league's scoring)
}

export interface LineupAlert {
  slot: string;
  playerId?: string | null; // the starter the alert is about; null for an empty slot
  playerName: string | null;
  reason: AlertReason;
  detail: string;
  suggestion?: BenchSuggestion | null;
}

export type RosterStatus = 'starter' | 'bench' | 'ir';

export interface RosterEntry {
  player: Player;
  status: RosterStatus;
}

export interface LeagueSummary {
  leagueId: string;
  platform: Platform;
  account: string; // which of your accounts owns the team
  name: string;
  season: string;
  week: number;
  myTeamId: string;
  standings: TeamStanding[];
  matchup: Matchup | null;
  alerts: LineupAlert[];
  roster: RosterEntry[]; // every player on your team
  // Set for hand-entered leagues.
  manual?: {
    leagueName: string; // the tournament, e.g. "Big Gorilla Tourney #104790" (name holds your team name)
    teamName: string;
    updatedAt: string;
    unmatched: string[];
    matchupCapturedAt: string | null;
    liveScored: boolean; // points computed from live stats rather than the pasted snapshot
  };
}

// A league you maintain by hand (e.g. FFPC, which has no API we can use).
export interface ManualLeagueInput {
  name: string;
  teamName: string;
  rosterText: string; // one player per line, optional slot prefix: "WR Puka Nacua"
  matchup?: ManualMatchup | null; // optional weekly snapshot pasted from a live scoring page
}

export interface ManualMatchupSide {
  teamName: string;
  points: number;
  projected?: number | null;
  starters: { slot: string; name: string; points: number }[];
}

export interface ManualMatchup {
  week: number;
  capturedAt: string; // when it was pasted; scores are a snapshot, not live
  me: ManualMatchupSide;
  opponent: ManualMatchupSide;
  // The league-wide weekly scoreboard, when the page shows one.
  scoreboard?: { teamName: string; points: number; projected: number | null }[];
}

export interface ManualLeague extends ManualLeagueInput {
  id: string;
  platform: Platform;
  updatedAt: string;
  waiversCapturedAt: string | null; // when FFPC's add/drop page was last pasted
}

export interface LeagueRef {
  leagueId: string;
  leagueName: string;
  platform: Platform;
}

// One real-world player and every league he touches you in.
export interface PlayerExposure {
  key: string; // cross-platform identity, e.g. "WR:jaylenwaddle" or "DEF:SF"
  player: Player;
  owned: (LeagueRef & { status: RosterStatus })[];
  facing: LeagueRef[]; // your opponent is starting him this week
}

// win/loss/tie once the week is over; live while it's still being played;
// null when there was no opponent to compare against.
export type WeekResult = 'win' | 'loss' | 'tie' | 'live' | null;

export interface HistoryWeek {
  week: number;
  points: number;
  projected: number | null;
  opponentName: string | null;
  opponentPoints: number | null;
  result: WeekResult;
  allPlay: { rank: number; teams: number; winSlots: number } | null;
  capturedAt: string;
}

export interface LeagueHistory {
  platform: Platform;
  leagueId: string;
  name: string;
  weeks: HistoryWeek[]; // oldest first
  // Head-to-head results over finished weeks. Leagues that also score against
  // the league median (a "double" record) will differ from the site's standings.
  record: { wins: number; losses: number; ties: number };
  avgPoints: number | null; // over finished weeks
}

export interface HistoryResponse {
  season: string;
  week: number;
  leagues: LeagueHistory[];
}

export interface SourceError {
  source: string;
  message: string;
}

export interface DashboardResponse {
  season: string;
  week: number;
  updatedAt: string;
  leagues: LeagueSummary[];
  players: PlayerExposure[];
  errors: SourceError[];
}

import type { WaiverRun } from './waiverSchedule';

// ── Waivers ────────────────────────────────────────────────────────────

// A player you could pick up, or one on your roster, valued two ways.
export interface WaiverPlayer {
  player: Player;
  week: number | null; // projected points in the week a claim would play in, in this league's scoring
  restOfSeason: number | null; // projected points from that week through the end of the regular season
  // Available players only: on waivers (a claim is needed) or a free agent (add any time).
  // null when the platform doesn't say.
  availability: 'waivers' | 'free_agent' | null;
  trendingAdds: number | null; // Sleeper users who added him in the last 24 hours
}

export type WaiverMoveReason = 'empty' | 'bye' | 'injury' | 'upgrade';

// One suggested transaction: who to add, who to drop for him, and why.
export interface WaiverMove {
  slot: string;
  reason: WaiverMoveReason;
  replaces: WaiverPlayer | null; // the starter he would take over from
  add: WaiverPlayer;
  drop: WaiverPlayer | null; // null when you have an open roster spot
  gain: number; // projected points gained this week
}

export interface WaiverRules {
  // faab: blind bidding; rolling: claiming sends you to the back; reverse: reset to reverse standings each week.
  type: 'faab' | 'rolling' | 'reverse_standings';
  faabLeft: number | null;
  faabTotal: number | null;
  priority: number | null; // your place in the claim order, 1 = first
  teams: number;
  schedule?: string | null; // when claims are processed, if the platform says
}

export interface WaiverLeague {
  leagueId: string;
  platform: Platform;
  name: string;
  rules: WaiverRules | null;
  moves: WaiverMove[];
  available: WaiverPlayer[]; // the best available at each position, unsorted
  openRosterSpots: number;
  // FFPC only: when its add/drop page was last pasted (null = never). Everything
  // above comes from that paste, so it is only as fresh as the paste.
  pastedAt?: string | null;
  // When this league's waivers process, and where that came from: its own
  // processed claims (history), FFPC's page, or (an estimate) its settings.
  runs: WaiverRun[];
  runsSource: 'history' | 'ffpc' | 'settings' | null;
  // Your claims for the next run (null when there's no known next run). ESPN
  // shows you your own pending claims; elsewhere you mark them set yourself.
  claims: WaiverClaims | null;
}

export interface WaiverClaims {
  runAt: string; // the next run this refers to
  set: boolean;
  source: 'espn' | 'you' | null; // who says they're set
  pending: number | null; // ESPN only: how many claims you have in
  // The reminder time has come and your claims still aren't set: the app
  // highlights this league until you deal with it (or the run happens).
  reminderDue: boolean;
}

export interface WaiversResponse {
  season: string;
  week: number; // the week a claim made now would play in
  lastRegularWeek: number;
  leagues: WaiverLeague[];
  errors: SourceError[];
}

// ── Accounts and leagues ───────────────────────────────────────────────

// A Sleeper account (all its leagues) or one ESPN league the dashboard follows.
export interface LeagueSource {
  id: number | null; // null for ones from .env, which can't be removed in the app
  platform: 'sleeper' | 'espn';
  value: string; // Sleeper username or ESPN league id
  label: string | null; // e.g. "BoyntonBoy · 1 league" or the ESPN league's name
  fromEnv: boolean;
}

export interface SourcesResponse {
  sources: LeagueSource[];
  espnCookies: boolean; // ESPN leagues need your ESPN cookies (set in .env)
}

// ── Live feed ──────────────────────────────────────────────────────────

// One player's scoring since the last look, and what it's worth in each league he's in.
export interface LiveEvent {
  id: number;
  at: string;
  week: number;
  player: Player;
  description: string; // "1 catch, 14 rec yds" or "now 17 points allowed"
  leagues: LiveEventLeague[];
}

export interface LiveEventLeague {
  leagueKey: string; // "sleeper:123"
  leagueName: string;
  platform: Platform;
  role: 'starter' | 'bench' | 'opponent'; // opponent = starting against you this week
  points: number | null; // null when that platform hasn't caught up yet
}

export interface LiveFeedResponse {
  week: number;
  live: boolean; // games are being played and the feed is watching
  lastCheckedAt: string | null;
  events: LiveEvent[]; // newest first
}

// ── Lineup recap ───────────────────────────────────────────────────────

// A start/sit call that cost points: who you started, and the bench player
// who would have scored more in that spot.
export interface CostlyCall {
  slot: string;
  started: { name: string; points: number };
  better: { name: string; points: number };
  cost: number;
}

export interface LineupRecap {
  platform: Platform;
  leagueId: string;
  leagueName: string;
  week: number;
  points: number; // what your starters scored
  best: number; // the best legal lineup from your roster that week
  leftOnBench: number; // best − points
  opponentPoints: number | null;
  result: 'win' | 'loss' | 'tie' | null;
  bestWouldWin: boolean; // a loss the best lineup would have won
  calls: CostlyCall[]; // biggest first
  // Players on no team in the league that week who outscored a starter of
  // yours (better.name is the free agent). Null where the platform can't say.
  missedPickups: CostlyCall[] | null;
  pickupsNote: string | null; // how "available" was judged, when it's approximate
}

export interface RecapResponse {
  season: string;
  week: number; // the week shown
  weeks: number[]; // every finished week, newest first
  leagues: LineupRecap[];
  errors: SourceError[];
}
