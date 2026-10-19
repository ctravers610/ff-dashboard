// Helpers shared by every platform adapter.

import type { AllPlay, AllPlayTeam, LineupAlert, MatchupSide, StarterSlot, TeamStanding } from '@ffd/shared';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Totals a side's starters; projected is null unless every starter has a projection.
export function totalSide(starters: StarterSlot[]): { points: number; projected: number | null } {
  const points = round2(starters.reduce((sum, s) => sum + s.points, 0));
  const hasAll = starters.every((s) => s.projected != null);
  const projected = hasAll ? round2(starters.reduce((sum, s) => sum + (s.projected ?? 0), 0)) : null;
  return { points, projected };
}

// Scoreboards may truncate names ("Perfect Seaso"), so match on prefix.
const sameTeam = (boardName: string, fullName: string) =>
  fullName.trim().toLowerCase().startsWith(boardName.trim().toLowerCase());

/**
 * Ranks an all-play week: every team's weekly score, with your matchup's two
 * teams swapped for their live numbers. The top half of the league wins.
 */
export function buildAllPlay(
  scoreboard: { teamName: string; points: number; projected: number | null }[],
  me: MatchupSide,
  opponent: MatchupSide | null,
): AllPlay | null {
  if (!scoreboard.some((t) => sameTeam(t.teamName, me.teamName))) return null;

  const teams: AllPlayTeam[] = scoreboard.map((t) => {
    const live = [me, opponent].find((side) => side && sameTeam(t.teamName, side.teamName));
    return live
      ? { teamName: live.teamName, points: live.points, projected: live.projected ?? t.projected, isMe: live === me, live: true }
      : { ...t, isMe: false, live: false };
  });
  teams.sort((a, b) => b.points - a.points);

  const myRank = teams.findIndex((t) => t.isMe) + 1;
  const byProjection = teams.every((t) => t.projected != null)
    ? [...teams].sort((a, b) => b.projected! - a.projected!)
    : null;
  return {
    teams,
    winSlots: Math.floor(teams.length / 2),
    myRank,
    myProjectedRank: byProjection ? byProjection.findIndex((t) => t.isMe) + 1 : null,
  };
}

// Sort by win percentage, then points for, and fill in each team's rank.
export function rankStandings(teams: TeamStanding[]): TeamStanding[] {
  const winPct = (t: TeamStanding) => {
    const games = t.wins + t.losses + t.ties;
    return games ? (t.wins + t.ties / 2) / games : 0;
  };
  const sorted = [...teams].sort((a, b) => winPct(b) - winPct(a) || b.pointsFor - a.pointsFor);
  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}

export function buildAlerts(starters: StarterSlot[]): LineupAlert[] {
  const alerts: LineupAlert[] = [];
  for (const { slot, player } of starters) {
    if (!player) {
      alerts.push({ slot, playerId: null, playerName: null, reason: 'empty', detail: `Empty ${slot} slot` });
    } else if (player.injuryStatus) {
      alerts.push({ slot, playerId: player.playerId, playerName: player.name, reason: 'injury', detail: player.injuryStatus });
    }
  }
  return alerts;
}
