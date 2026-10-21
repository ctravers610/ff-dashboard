// When each league's waivers run, so the Waivers tab can put the league that
// processes next first. Times are US Eastern, the time zone every platform
// quotes, and stay correct across daylight saving changes.

export interface WaiverRun {
  day: number; // 0 = Sunday … 6 = Saturday
  time: string; // "HH:MM", 24-hour, Eastern
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZONE = 'America/New_York';

/** A moment's date and time as read on a New York clock. */
export const easternParts = (date: Date) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
};

/** The moment it is a given wall-clock time in New York. */
export function easternTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  // Two passes settle the offset, including on the day the clocks change.
  for (let i = 0; i < 2; i++) {
    const p = easternParts(new Date(guess));
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** The next run after `now`, and when it happens; null if there are no runs. */
export function nextRun(runs: WaiverRun[], now = new Date()): { run: WaiverRun; at: Date } | null {
  let best: { run: WaiverRun; at: Date } | null = null;
  for (let offset = 0; offset <= 7; offset++) {
    const date = easternParts(new Date(now.getTime() + offset * 86_400_000));
    for (const run of runs) {
      if (run.day !== date.weekday) continue;
      const [h, m] = run.time.split(':').map(Number);
      const at = easternTime(date.year, date.month, date.day, h!, m!);
      if (at > now && (!best || at < best.at)) best = { run, at };
    }
  }
  return best;
}

/** The most recent run at or before `now`, within the last week; null if there are no runs. */
export function lastRun(runs: WaiverRun[], now = new Date()): Date | null {
  let at = nextRun(runs, new Date(now.getTime() - 7 * 86_400_000 - 1))?.at ?? null;
  let last: Date | null = null;
  // Step through the week's occurrences up to now.
  while (at && at <= now) {
    last = at;
    at = nextRun(runs, at)?.at ?? null;
  }
  return last;
}

/** The next time any of these runs happens after `now`, or null if there are none. */
export const nextWaiverRun = (runs: WaiverRun[], now = new Date()) => nextRun(runs, now)?.at ?? null;

// Runs before 6 AM happen while you're asleep: they're "the night before" to a person.
export const isOvernight = ({ time }: WaiverRun) => Number(time.split(':')[0]) < 6;

/** "Wednesdays at 11 pm ET and Sundays at 10 am ET", as FFPC's add/drop page words it. */
/**
 * FFPC processes bids at the same times in every league: Wednesdays at 11 PM
 * and Sundays at 10 AM Eastern. Used until a league's add/drop page is pasted
 * (whose own schedule wins, in case FFPC ever changes it).
 */
export const FFPC_STANDARD_RUNS: WaiverRun[] = [
  { day: 3, time: '23:00' },
  { day: 0, time: '10:00' },
];

export function parseFfpcBidSchedule(text: string): WaiverRun[] {
  const runs: WaiverRun[] = [];
  const re = /(Sun|Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?)\w*\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  for (const m of text.matchAll(re)) {
    const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[1]!.slice(0, 3).toLowerCase());
    let hour = Number(m[2]) % 12;
    if (m[4]!.toLowerCase() === 'pm') hour += 12;
    runs.push({ day, time: `${String(hour).padStart(2, '0')}:${m[3] ?? '00'}` });
  }
  return runs;
}

/** "Wed 11:00 PM" */
export function describeRun({ day, time }: WaiverRun): string {
  const [h, m] = time.split(':').map(Number);
  const hour12 = h! % 12 || 12;
  return `${WEEKDAYS[day]!.slice(0, 3)} ${hour12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`;
}

/** How a person thinks of a run: "Tue night" for Wednesday 3 AM, otherwise "Wed 11:00 PM". */
export function friendlyRun(run: WaiverRun): string {
  return isOvernight(run) ? `${WEEKDAYS[(run.day + 6) % 7]!.slice(0, 3)} night` : describeRun(run);
}

/** "Tue night (Wed 3:00 AM)", or just "Wed 11:00 PM" when that's already clear. */
export function friendlyRunWithTime(run: WaiverRun): string {
  return isOvernight(run) ? `${friendlyRun(run)} (${describeRun(run)})` : describeRun(run);
}

/**
 * Works out a league's waiver schedule from when its past claims were
 * processed. A run is a cluster of claims within an hour of each other on the
 * same weekday, holding at least three claims and a quarter of them all; claims
 * scattered through a day (players whose own waiver period ran out) don't make
 * a run. Its time is the cluster's median, rounded down to the quarter hour,
 * since claims finish a few minutes after a run starts.
 */
export function inferWaiverRuns(processedAt: Date[]): WaiverRun[] {
  const byDay = new Map<number, number[]>();
  for (const at of processedAt) {
    const p = easternParts(at);
    byDay.set(p.weekday, [...(byDay.get(p.weekday) ?? []), p.hour * 60 + p.minute]);
  }
  const runs: WaiverRun[] = [];
  for (const [day, minutes] of byDay) {
    const sorted = [...minutes].sort((a, b) => a - b);
    // The largest group of claims that fits in a one-hour window.
    let best: number[] = [];
    for (let i = 0, j = 0; j < sorted.length; j++) {
      while (sorted[j]! - sorted[i]! > 60) i++;
      if (j - i + 1 > best.length) best = sorted.slice(i, j + 1);
    }
    if (best.length < 3 || best.length < processedAt.length / 4) continue;
    const median = best[Math.floor(best.length / 2)]!;
    const rounded = median - (median % 15);
    runs.push({ day, time: `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}` });
  }
  return runs.sort((a, b) => a.day - b.day);
}
