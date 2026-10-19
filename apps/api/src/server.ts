// Starts the API: check the configuration, bring the database up to date, then listen.

import { manualLeagueRepo } from './adapters/manual/store.js';
import { yahooTokenRepo } from './adapters/yahoo/auth.js';
import { buildApp } from './app.js';
import { sessionStore } from './auth/sessions.js';
import { config, configProblems } from './config.js';
import { db, pool, runMigrations } from './db/client.js';
import { defaultSender } from './reminders/routes.js';
import { sendDueReminders, sendLineupCheck, sendWeeklyRecap } from './reminders/send.js';
import { reminderRepo } from './reminders/store.js';
import { getWaivers } from './waivers/index.js';
import { sleeperNflState } from './adapters/sleeper/index.js';
import { gamesLive, pollLive } from './live/service.js';

const app = await buildApp();

// Fail closed: in production a configuration problem (above all, sign-in not set
// up) stops the server, because running open to the internet is worse than not running.
const problems = configProblems(config);
for (const problem of problems) app.log[process.env.NODE_ENV === 'production' ? 'error' : 'warn'](problem);
if (problems.length > 0 && process.env.NODE_ENV === 'production') {
  app.log.error('Refusing to start until the configuration problems above are fixed.');
  process.exit(1);
}
if (config.auth.mode === 'off') app.log.warn('Sign-in is off: anyone who can reach this server can use it. Fine for local development only.');

// Bring the database schema up to date before taking requests.
try {
  await runMigrations();
  const imported = await manualLeagueRepo.importLegacyJson();
  if (imported > 0) app.log.info(`Imported ${imported} manual league(s) from the old JSON file into Postgres`);
  if (await yahooTokenRepo.importLegacyFile()) app.log.info('Moved the Yahoo tokens from the old file into the database, encrypted');
} catch (e) {
  app.log.error(e, 'Could not reach the database. Is it running? Start it with: docker compose up -d');
  process.exit(1);
}

// Housekeeping: drop expired sessions now and once a day.
const sessions = sessionStore(db);
const purge = () =>
  sessions
    .removeExpired()
    .then((n) => n > 0 && app.log.info(`Removed ${n} expired session(s)`))
    .catch((e) => app.log.warn(e, 'Could not remove expired sessions'));
await purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

// Waiver reminders: every 5 minutes, push any that are due. A scheduled job
// rather than a timer per reminder, so a restart (or a host waking the app from
// sleep) catches up on anything due, and each run still only reminds once.
const sender = defaultSender();
if (sender) {
  const checkReminders = async () => {
    await getWaivers()
      .then((w) => sendDueReminders(w.leagues, reminderRepo, sender))
      .then((n) => n > 0 && app.log.info(`Sent ${n} waiver reminder(s)`))
      .catch((e) => app.log.warn(e, 'Could not check waiver reminders'));
    await sendLineupCheck(reminderRepo, sender)
      .then((n) => n > 0 && app.log.info(`Sent a lineup check covering ${n} starter(s)`))
      .catch((e) => app.log.warn(e, 'Could not run the lineup check'));
    await sendWeeklyRecap(reminderRepo, sender)
      .then((sent) => sent && app.log.info('Sent the weekly lineup recap'))
      .catch((e) => app.log.warn(e, 'Could not send the weekly recap'));
  };
  setTimeout(checkReminders, 30_000).unref(); // shortly after startup, once caches are warm
  setInterval(checkReminders, 5 * 60 * 1000).unref();
} else {
  app.log.info('Waiver reminders are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to turn them on.');
}

// The live feed: every 30 seconds while games are on, record scoring changes.
let polling = false;
setInterval(async () => {
  if (polling) return; // a slow check never overlaps the next
  polling = true;
  try {
    const { season, week } = await sleeperNflState();
    if (await gamesLive(season, week)) {
      const events = await pollLive();
      if (events.length) app.log.info(`Live feed: ${events.length} new scoring event(s)`);
    }
  } catch (e) {
    app.log.warn(e, 'Live feed check failed');
  } finally {
    polling = false;
  }
}, 30_000).unref();

// Hosts stop the old instance with SIGTERM on every deploy (and Ctrl+C sends
// SIGINT): stop accepting requests, let in-flight ones finish, close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

// When `tsx watch` restarts the dev server, the new process can start while the
// old one is still finishing its graceful shutdown, so the port is briefly
// taken. Retry for a few seconds instead of crashing.
for (let attempt = 1; ; attempt++) {
  try {
    await app.listen({ port: config.port, host: config.host });
    break;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 20) throw e;
    await new Promise((r) => setTimeout(r, 250));
  }
}
