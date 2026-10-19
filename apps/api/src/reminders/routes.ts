// Waiver reminders over HTTP: the browser fetches our public key, subscribes,
// and can ask for a test notification; the Waivers tab marks claims as set.

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { reminderRepo, type ReminderStore } from './store.js';
import { sendToAll, webPushSender, type Sender } from './send.js';

// The contact push services may use about our messages: an https address or a mailto.
export const pushSubject = () =>
  process.env.VAPID_SUBJECT?.trim() ||
  (config.publicUrl.startsWith('https://') && !config.publicUrl.includes('localhost') ? config.publicUrl : 'mailto:reminders@fantasy-dashboard.invalid');

export const defaultSender = (): Sender | null => (config.push ? webPushSender(config.push, pushSubject()) : null);

const subscriptionSchema = {
  type: 'object',
  required: ['endpoint', 'keys'],
  properties: {
    endpoint: { type: 'string', format: 'uri', maxLength: 2000 },
    keys: {
      type: 'object',
      required: ['p256dh', 'auth'],
      properties: { p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } },
    },
  },
} as const;

const claimsSchema = {
  type: 'object',
  required: ['platform', 'leagueId', 'runAt', 'set'],
  additionalProperties: false,
  properties: {
    platform: { type: 'string', enum: ['sleeper', 'espn', 'yahoo', 'ffpc'] },
    leagueId: { type: 'string', maxLength: 100 },
    runAt: { type: 'string', format: 'date-time' },
    set: { type: 'boolean' },
  },
} as const;

export const reminderRoutes = ({ store = reminderRepo, sender = defaultSender(), publicKey = config.push?.publicKey ?? null }: {
  store?: ReminderStore;
  sender?: Sender | null;
  publicKey?: string | null;
} = {}) =>
  async function (app: FastifyInstance) {
    app.get('/api/push/key', async () => ({ publicKey }));

    app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
      '/api/push/subscriptions',
      { schema: { body: subscriptionSchema } },
      async (req, reply) => {
        await store.subscribe(req.body);
        return reply.code(201).send({ ok: true });
      },
    );

    app.delete<{ Body: { endpoint: string } }>(
      '/api/push/subscriptions',
      { schema: { body: { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string' } } } } },
      async (req, reply) => {
        await store.unsubscribe(req.body.endpoint);
        return reply.code(204).send();
      },
    );

    app.post('/api/push/test', async (_req, reply) => {
      if (!sender) return reply.code(409).send({ message: 'Reminders are not set up on the server (VAPID keys missing).' });
      return sendToAll(store, sender, {
        title: 'Waiver reminders are on',
        body: "You'll get a nudge at 9 PM before overnight waiver runs, and 2 hours before the rest.",
        url: '/?view=waivers',
        tag: 'waivers:test',
      });
    });

    app.put<{ Body: { platform: string; leagueId: string; runAt: string; set: boolean } }>(
      '/api/waivers/claims',
      { schema: { body: claimsSchema } },
      async (req, reply) => {
        const { platform, leagueId, runAt, set } = req.body;
        await store.setClaims(platform, leagueId, new Date(runAt), set);
        return reply.code(204).send();
      },
    );
  };
