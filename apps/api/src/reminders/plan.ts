// When to remind you about a waiver run, and what to say. Pure functions, so
// the timing rules are easy to test without a clock or a database.

import { easternParts, easternTime, friendlyRun, friendlyRunWithTime, isOvernight, nextRun, type WaiverClaims, type WaiverLeague, type WaiverRun } from '@ffd/shared';

/**
 * Overnight runs (before 6 AM) remind at 9 PM Eastern the evening before,
 * while you're still up. Anything else, like FFPC's Wednesday 11 PM and
 * Sunday 10 AM, reminds two hours ahead.
 */
export function remindAt(run: WaiverRun, at: Date): Date {
  if (!isOvernight(run)) return new Date(at.getTime() - 2 * 60 * 60 * 1000);
  const evening = easternParts(new Date(at.getTime() - 12 * 60 * 60 * 1000)); // any moment on the evening before
  return easternTime(evening.year, evening.month, evening.day, 21, 0);
}

export interface ReminderState {
  claimsSetAt: Date | null;
  remindedAt: Date | null;
}

export const reminderKey = (platform: string, leagueId: string, runAt: Date) => `${platform}:${leagueId}:${runAt.toISOString()}`;

/**
 * Your claims for a league's next run: set if ESPN shows claims pending or you
 * marked them set, and flagged once the reminder time has come while they aren't.
 */
export function claimStatus(
  league: Pick<WaiverLeague, 'platform' | 'leagueId' | 'runs'>,
  state: Map<string, ReminderState>,
  espnPending: number | null,
  now: Date,
): WaiverClaims | null {
  const next = nextRun(league.runs, now);
  if (!next) return null;
  const yours = state.get(reminderKey(league.platform, league.leagueId, next.at))?.claimsSetAt;
  const set = Boolean(espnPending) || Boolean(yours);
  return {
    runAt: next.at.toISOString(),
    set,
    source: espnPending ? 'espn' : yours ? 'you' : null,
    pending: espnPending,
    reminderDue: !set && now >= remindAt(next.run, next.at),
  };
}

export interface DueReminder {
  league: WaiverLeague;
  run: WaiverRun;
  runAt: Date;
}

/** Leagues whose reminder time has come, whose run hasn't happened, and that nobody has dealt with yet. */
export function dueReminders(leagues: WaiverLeague[], state: Map<string, ReminderState>, now: Date): DueReminder[] {
  return leagues.flatMap((league) => {
    const next = nextRun(league.runs, now);
    if (!next || league.claims?.set) return [];
    if (now < remindAt(next.run, next.at)) return [];
    const seen = state.get(reminderKey(league.platform, league.leagueId, next.at));
    if (seen?.remindedAt || seen?.claimsSetAt) return [];
    return [{ league, run: next.run, runAt: next.at }];
  });
}

export interface ReminderMessage {
  title: string;
  body: string;
  url: string; // where tapping the notification goes
  tag: string; // a newer reminder for the same league replaces the older one
  leagueKey: string;
  platform: string;
  leagueId: string;
  runAt: string;
}

export function reminderMessage({ league, run, runAt }: DueReminder): ReminderMessage {
  const [first] = league.moves;
  const moves =
    league.moves.length === 0
      ? 'No suggested moves.'
      : `${league.moves.length} suggested move${league.moves.length > 1 ? 's' : ''}: add ${first!.add.player.name}${league.moves.length > 1 ? ' first' : ''}.`;
  const leagueKey = `${league.platform}:${league.leagueId}`;
  return {
    // "Other employment league: waivers Tue night" / "Club 223: waivers in 2 hours"
    title: `${league.name}: waivers ${isOvernight(run) ? friendlyRun(run) : 'in 2 hours'}`,
    body: `Claims process ${friendlyRunWithTime(run)} ET. ${moves}`,
    url: `/?view=waivers&league=${encodeURIComponent(leagueKey)}`,
    tag: `waivers:${leagueKey}`,
    leagueKey,
    platform: league.platform,
    leagueId: league.leagueId,
    runAt: runAt.toISOString(),
  };
}
