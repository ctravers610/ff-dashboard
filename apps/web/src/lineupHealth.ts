import { canPlay, type LeagueSummary, type LineupAlert, type WaiverLeague } from '@ffd/shared';

// Whether a league's lineup is ready, as a traffic light on its matchup row:
//   green  - nothing to fix;
//   yellow - something to fix, and there's a way: a healthy bench player (even
//            for a starter who is Out), or a free agent / waiver claim for a
//            slot the bench can't fill; also a Questionable or Doubtful starter;
//   red    - a starter who is Out with nobody to replace him, or a slot nobody can fill.
export type Health = 'green' | 'yellow' | 'red';

const OUT = new Set(['Out', 'IR', 'Suspended', 'PUP']);

export interface LineupIssue {
  alert: LineupAlert;
  level: Exclude<Health, 'green'>;
  label: string; // short, for the row: "Lamar Jackson out", "Empty QB"
  fix: string; // what to do about it
}

function issue(alert: LineupAlert, waivers: WaiverLeague | undefined): LineupIssue {
  const who = alert.playerName ?? '';
  if (alert.reason === 'injury') {
    const out = OUT.has(alert.detail);
    const fix = alert.suggestion
      ? `Start ${alert.suggestion.playerName} (${alert.suggestion.position}) from your bench instead`
      : 'No healthy bench player who hasn’t played yet can take his place';
    return { alert, level: out && !alert.suggestion ? 'red' : 'yellow', label: `${who} ${alert.detail.toLowerCase()}`, fix };
  }
  // An empty slot, or a starter on bye (the same thing: no points).
  const label = alert.reason === 'bye' ? `${who} on bye` : `Empty ${alert.slot}`;
  if (alert.suggestion) {
    const proj = alert.suggestion.projected != null ? ` (projected ${alert.suggestion.projected.toFixed(1)} in PPR)` : '';
    return { alert, level: 'yellow', label, fix: `Start ${alert.suggestion.playerName} (${alert.suggestion.position}) from your bench${proj}` };
  }
  const pickup = waivers?.available.find((p) => canPlay(alert.slot, p.player.position));
  if (pickup) {
    const how = pickup.availability === 'free_agent' ? 'Pick up' : 'Claim';
    return { alert, level: 'yellow', label, fix: `Nobody on your bench fits. ${how} ${pickup.player.name} (${pickup.player.position}) or another ${alert.slot} on the Waivers tab` };
  }
  return { alert, level: 'red', label, fix: 'Nobody on your bench or the waiver wire can fill it' };
}

/** A league's lineup problems, worst first, and its overall color. */
export function lineupHealth(league: LeagueSummary, waivers: WaiverLeague | undefined): { health: Health; issues: LineupIssue[] } {
  const issues = league.alerts.map((a) => issue(a, waivers)).sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const health: Health = issues.some((i) => i.level === 'red') ? 'red' : issues.length ? 'yellow' : 'green';
  return { health, issues };
}

export const HEALTH_TEXT: Record<Health, string> = { green: 'lineup set', yellow: 'lineup needs a change', red: 'lineup problem' };
