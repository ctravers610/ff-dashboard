// Sends waiver reminders as browser push notifications (the Web Push protocol,
// via the web-push library: each message is encrypted for the browser and
// signed with our VAPID key, then handed to that browser's push service).

import type { WaiverLeague } from '@ffd/shared';
import webpush from 'web-push';
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
