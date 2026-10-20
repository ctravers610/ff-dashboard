// FFPC has no API, so its data is only as fresh as your last paste. These are
// the nudges to paste again: the add/drop page after each bid run (who's
// available and your FAAB have changed), and the Live Scoring page on Sunday
// morning (your lineup may have changed since). Pure functions, like plan.ts.

import { easternParts, easternTime, lastRun, type WaiverLeague } from '@ffd/shared';

const HOUR = 60 * 60 * 1000;

/** Not before 8 AM or after 10 PM Eastern: a reminder due overnight waits for the morning. */
export function awake(at: Date): Date {
  const { hour } = easternParts(at);
  if (hour >= 8 && hour < 22) return at;
  const morning = easternParts(hour >= 22 ? new Date(at.getTime() + 12 * HOUR) : at);
  return easternTime(morning.year, morning.month, morning.day, 8, 0);
}

/** Whether a league's add/drop paste predates its last bid run. */
export function addDropStale(league: Pick<WaiverLeague, 'runs' | 'pastedAt'>, now: Date): boolean {
  const run = lastRun(league.runs, now);
  return run != null && league.pastedAt != null && new Date(league.pastedAt) < run;
}

export interface FfpcPasteIssue {
  key: string;
  leagueId: string;
  leagueName: string;
  page: 'add-drop' | 'live-scoring';
}

export interface FfpcLineupPaste {
  week: number;
  capturedAt: Date;
}

/**
 * The paste reminders due now. Add/drop: an hour after a bid run (results are
 * posted by then, and overnight runs wait for the morning), once per run.
 * Live Scoring: Sunday 11 AM to 1 PM Eastern, before the early games, once per
 * week, if this week's lineup wasn't pasted since the last bid run.
 */
export function dueFfpcPasteIssues(
  leagues: WaiverLeague[],
  lineups: Map<string, FfpcLineupPaste | null>,
  season: string,
  week: number,
  now: Date,
): FfpcPasteIssue[] {
  const { weekday, hour } = easternParts(now);
  const sundayMorning = weekday === 0 && hour >= 11 && hour < 13;
  return leagues
    .filter((l) => l.platform === 'ffpc')
    .flatMap((l): FfpcPasteIssue[] => {
      const issues: FfpcPasteIssue[] = [];
      const run = lastRun(l.runs, now);
      if (run && addDropStale(l, now) && now >= awake(new Date(run.getTime() + HOUR))) {
        issues.push({ key: `ffpc-paste:add-drop:${l.leagueId}:${run.toISOString()}`, leagueId: l.leagueId, leagueName: l.name, page: 'add-drop' });
      }
      const lineup = lineups.get(l.leagueId);
      const lineupStale = !lineup || lineup.week !== week || (run != null && lineup.capturedAt < run);
      if (sundayMorning && lineupStale) {
        issues.push({ key: `ffpc-paste:live-scoring:${l.leagueId}:${season}:${week}`, leagueId: l.leagueId, leagueName: l.name, page: 'live-scoring' });
      }
      return issues;
    });
}

export function ffpcPasteMessage(issues: FfpcPasteIssue[]) {
  const addDrop = issues.filter((i) => i.page === 'add-drop');
  const scoring = issues.filter((i) => i.page === 'live-scoring');
  const names = (list: FfpcPasteIssue[]) => list.map((i) => i.leagueName).join(' and ');
  const lines: string[] = [];
  if (addDrop.length) lines.push(`Bids have processed: paste the add/drop page for ${names(addDrop)} to see who's available now.`);
  if (scoring.length) lines.push(`Paste the Live Scoring page for ${names(scoring)} so your lineup is current before kickoff.`);
  return {
    title: issues.length === 1 ? `${issues[0]!.leagueName}: FFPC paste is out of date` : 'FFPC pastes are out of date',
    body: lines.join(' '),
    // The add/drop page is pasted on the Waivers tab; Live Scoring from the matchups.
    url: addDrop.length ? `/?view=waivers&league=${encodeURIComponent(`ffpc:${addDrop[0]!.leagueId}`)}` : '/',
    tag: 'ffpc-paste',
  };
}
