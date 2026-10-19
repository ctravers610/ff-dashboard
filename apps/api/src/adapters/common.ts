// Helpers shared by every platform adapter.

import type { LineupAlert, StarterSlot, TeamStanding } from '@ffd/shared';

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
      alerts.push({ slot, playerName: null, reason: 'empty', detail: `Empty ${slot} slot` });
    } else if (player.injuryStatus) {
      alerts.push({ slot, playerName: player.name, reason: 'injury', detail: player.injuryStatus });
    }
  }
  return alerts;
}
