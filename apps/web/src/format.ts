import type { AllPlay, LeagueSummary, Matchup, MatchupSide, StarterGame, TeamStanding } from '@ffd/shared';

// Whether you're winning this week, now and by projection. In an all-play week
// that means being inside the top-N win line; otherwise beating your opponent.
// null = no matchup to judge (bye, no data).
export function matchupStatus(m: Matchup | null): { leading: boolean | null; projectedWin: boolean | null } {
  if (m?.allPlay) {
    const { myRank, myProjectedRank, winSlots } = m.allPlay;
    return { leading: myRank <= winSlots, projectedWin: myProjectedRank != null ? myProjectedRank <= winSlots : null };
  }
  if (!m?.opponent) return { leading: null, projectedWin: null };
  const { me, opponent } = m;
  return {
    leading: me.points > opponent.points,
    projectedWin: me.projected != null && opponent.projected != null ? me.projected > opponent.projected : null,
  };
}

export const pts = (n: number) => n.toFixed(2);

/** Whether anyone in the matchup has scored yet; before then, only projections mean anything. */
export const underway = (m: Matchup | null) =>
  !!m && (m.me.points !== 0 || (m.opponent?.points ?? 0) !== 0 || (m.allPlay?.teams.some((t) => t.points !== 0) ?? false));

/**
 * Before kickoff, a head-to-head matchup's projected scores (yours, theirs and
 * the margin); null once it's underway, or when there's nothing to project.
 */
export function pregame(m: Matchup | null): { me: number; opponent: number; margin: number } | null {
  if (!m || m.allPlay || underway(m) || !m.opponent || m.me.projected == null || m.opponent.projected == null) return null;
  return { me: m.me.projected, opponent: m.opponent.projected, margin: m.me.projected - m.opponent.projected };
}

/** Your points minus the win line's: the first team outside it if you're in, the last team inside it if not. */
export function allPlayGap({ teams, winSlots, myRank }: AllPlay): number | null {
  const me = teams[myRank - 1];
  const line = myRank <= winSlots ? teams[winSlots] : teams[winSlots - 1];
  return me && line ? me.points - line.points : null;
}

/** How far ahead (+) or behind (−) you are right now: vs your opponent, or vs the win line in an all-play week. */
export function matchupMargin(m: Matchup | null): number | null {
  if (m?.allPlay) return allPlayGap(m.allPlay);
  if (!m?.opponent) return null;
  return m.me.points - m.opponent.points;
}

/** How a side's starters stand, or null when the schedule is unknown. A bye counts as done: nothing is to come. */
export function gamesLeft(side: MatchupSide): { done: number; live: number; pre: number } | null {
  const games = side.starters.filter((s) => s.player).map((s) => s.game);
  if (games.length === 0 || games.some((g) => !g)) return null;
  const count = (states: StarterGame['state'][]) => games.filter((g) => states.includes(g!.state)).length;
  return { done: count(['final', 'bye']), live: count(['live']), pre: count(['pre']) };
}

/** Whether every game that matters to this matchup is over, so the result is in. */
export function matchupOver(m: Matchup | null): boolean {
  if (!m) return false;
  const sides = m.opponent ? [m.me, m.opponent] : [m.me];
  return sides.every((s) => {
    const left = gamesLeft(s);
    return left != null && left.live + left.pre === 0;
  });
}

export type Tone = 'win' | 'toss' | 'lose' | 'none';

// One color job on the home page: your chance to win, always with a word beside it.
export function verdict(chance: number | null, over: boolean): { word: string; tone: Tone } {
  if (chance == null) return { word: 'No matchup', tone: 'none' };
  if (over) return chance > 0.5 ? { word: 'Won', tone: 'win' } : chance < 0.5 ? { word: 'Lost', tone: 'lose' } : { word: 'Tied', tone: 'toss' };
  if (chance >= 0.9) return { word: 'Cruising', tone: 'win' };
  if (chance >= 0.6) return { word: 'Favored', tone: 'win' };
  if (chance >= 0.4) return { word: 'Toss-up', tone: 'toss' };
  if (chance >= 0.1) return { word: 'Underdog', tone: 'lose' };
  return { word: 'Long shot', tone: 'lose' };
}

/** What to call a player where there's little room: "Freiermuth", "St. Brown", "Thomas" for Brian Thomas Jr., "Bills" for a defense. */
export function shortName(name: string): string {
  const parts = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/, '').split(' ');
  const last = parts.pop() ?? name;
  return parts.at(-1) === 'St.' ? `St. ${last}` : last;
}

/** A time for a live play: "2:35", with the day when it wasn't today (a week's plays run Thursday to Monday). */
export function clockTime(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  return at.toDateString() === new Date().toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

export const record = (t: Pick<TeamStanding, 'wins' | 'losses' | 'ties'>) =>
  t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;

export const ordinal = (n: number) => {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export const PLATFORM_LABEL: Record<string, string> = {
  sleeper: 'Sleeper',
  espn: 'ESPN',
  yahoo: 'Yahoo',
  ffpc: 'FFPC',
};

// What to call a league on screen: your team's name, with the league's own
// name as the smaller line beneath it. Just the league's name when the
// platform gave no team name (or it's the same).
export interface LeagueLabel {
  title: string;
  league: string | null; // the league's name, when the title is your team's
}

export function leagueLabel(l: LeagueSummary): LeagueLabel {
  // Hand-entered leagues are already named by your team (see adapters/manual).
  const league = l.manual?.leagueName || l.name;
  const team = (l.manual ? l.manual.teamName : (l.standings.find((t) => t.teamId === l.myTeamId)?.teamName ?? l.matchup?.me.teamName))?.trim();
  return team && team !== league ? { title: team, league } : { title: league, league: null };
}

/** The label for a league on a tab whose data only has its name (Waivers, History), from the dashboard's copy of it. */
export function labelFor(leagues: LeagueSummary[] | undefined, ref: { platform: string; leagueId: string; name: string }): LeagueLabel {
  const found = leagues?.find((l) => l.platform === ref.platform && l.leagueId === ref.leagueId);
  return found ? leagueLabel(found) : { title: ref.name, league: null };
}

/** The smaller line under a league's title: "Office League · Sleeper", or just "Sleeper" without a league name. */
export const leagueSubtitle = ({ league }: LeagueLabel, after: string | undefined) => [league, after].filter(Boolean).join(' · ');

/** "120 · 60": your PMR and your opponent's (just yours in an all-play week). */
export function pmr(l: LeagueSummary): string {
  const mine = l.matchup?.me.minutesLeft;
  if (mine == null) return '—';
  const theirs = l.matchup?.opponent?.minutesLeft;
  return theirs == null ? String(mine) : `${mine} · ${theirs}`;
}
