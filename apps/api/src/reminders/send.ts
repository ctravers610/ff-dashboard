// Sends waiver reminders as browser push notifications (the Web Push protocol,
// via the web-push library: each message is encrypted for the browser and
// signed with our VAPID key, then handed to that browser's push service).

import type { WaiversResponse, WaiverLeague } from '@ffd/shared';
import webpush from 'web-push';
import { getDashboard } from '../dashboard.js';
import { nflGames } from '../scoring/games.js';
import { getOutlook } from '../outlook/index.js';
import { getRecap } from '../recap/index.js';
import { manualLeagueRepo } from '../adapters/manual/store.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { dueFfpcPasteIssues, ffpcPasteMessage } from './ffpcPaste.js';
import { dueLineupIssues, lineupIssues, lineupMessage } from './lineup.js';
import { isRecapTime, recapKey, recapMessage } from './recap.js';
import { dueReminders, reminderMessage, type ReminderMessage } from './plan.js';
import type { PushSubscriptionInput, ReminderStore } from './store.js';

/** Delivers one payload to one browser; throws (with statusCode) when the push service refuses. */
export type Sender = (subscription: PushSubscriptionInput, payload: string) => Promise<void>;

export function webPushSender(keys: { publicKey: string; privateKey: string }, subject: string): Sender {
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return async (subscription, payload) => {
    // Kept for an hour at most: a waiver reminder that arrives after the run is useless.
    await webpush.sendNotification(subscription, payload, { TTL: 3600, urgency: 'high' });
  };
}

/** Sends one message to every subscribed browser, forgetting browsers that have gone away. */
export async function sendToAll(store: ReminderStore, sender: Sender, message: ReminderMessage | Record<string, unknown>) {
  const subscriptions = await store.subscriptions();
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await sender(sub, JSON.stringify(message));
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.endpoint); // unsubscribed or expired
        else throw e;
      }
    }),
  );
  await store.removeSubscriptions(gone);
  return { sent, removed: gone.length };
}

/** Sends every reminder that's due now, once each. Returns how many went out. */
export async function sendDueReminders(leagues: WaiverLeague[], store: ReminderStore, sender: Sender, now = new Date()): Promise<number> {
  const due = dueReminders(leagues, await store.upcoming(now), now);
  for (const reminder of due) {
    await sendToAll(store, sender, reminderMessage(reminder));
    await store.markReminded(reminder.league.platform, reminder.league.leagueId, reminder.runAt);
  }
  return due.length;
}

/** The pre-kickoff lineup check: one notification for every lineup problem now due. Returns how many it covered. */
export async function sendLineupCheck(store: ReminderStore, sender: Sender, now = new Date()): Promise<number> {
  const dashboard = await getDashboard();
  const games = await nflGames(dashboard.season, dashboard.week);
  const issues = lineupIssues(dashboard.leagues, games, dashboard.season, dashboard.week);
  const due = dueLineupIssues(issues, await store.sentKeys(issues.map((i) => i.key)), now);
  if (due.length === 0) return 0;
  await sendToAll(store, sender, lineupMessage(due));
  await store.markSent(due.map((i) => i.key));
  return due.length;
}

/** Nudges to paste FFPC's pages again once they're out of date, once each. Returns how many it covered. */
export async function sendFfpcPasteReminders(waivers: WaiversResponse, store: ReminderStore, sender: Sender, now = new Date()): Promise<number> {
  if (!waivers.leagues.some((l) => l.platform === 'ffpc')) return 0;
  const lineups = new Map((await manualLeagueRepo.list()).map((l) => [l.id, l.matchup ? { week: l.matchup.week, capturedAt: new Date(l.matchup.capturedAt) } : null]));
  const nfl = await sleeperClient.state(); // the lineup that matters is this week's, not the claim week's
  const issues = dueFfpcPasteIssues(waivers.leagues, lineups, nfl.season, nfl.week, now);
  const sent = await store.sentKeys(issues.map((i) => i.key));
  const due = issues.filter((i) => !sent.has(i.key));
  if (due.length === 0) return 0;
  await sendToAll(store, sender, ffpcPasteMessage(due));
  await store.markSent(due.map((i) => i.key));
  return due.length;
}

/** The Tuesday recap of the week just finished, once. Returns whether it went out. */
export async function sendWeeklyRecap(store: ReminderStore, sender: Sender, now = new Date()): Promise<boolean> {
  if (!isRecapTime(now)) return false;
  const recap = await getRecap();
  if (!recap.week || recap.leagues.length === 0) return false;
  const key = recapKey(recap.season, recap.week);
  if ((await store.sentKeys([key])).size) return false;
  // Next week's opponents are a bonus: the recap goes out without them if they can't be loaded.
  const outlook = await getOutlook().catch(() => null);
  const names = new Map(recap.leagues.map((l) => [`${l.platform}:${l.leagueId}`, l.leagueName]));
  const nextUp = (outlook?.leagues ?? []).flatMap((l) =>
    l.next ? [{ leagueName: names.get(`${l.platform}:${l.leagueId}`) ?? l.leagueId, teamName: l.next.teamName, winChance: l.next.winChance }] : [],
  );
  await sendToAll(store, sender, recapMessage(recap, nextUp));
  await store.markSent([key]);
  return true;
}
