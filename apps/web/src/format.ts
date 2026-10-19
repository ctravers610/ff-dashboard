import type { Matchup, TeamStanding } from '@ffd/shared';

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
