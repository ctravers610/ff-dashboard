import type { AllPlay, Matchup, TeamStanding } from '@ffd/shared';

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

// A margin this small could flip on one play, so it's flagged as close.
export const CLOSE_MARGIN = 10;

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
