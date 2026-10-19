// Service worker: shows waiver reminders pushed by the server, even when the
// dashboard isn't open. Kept as plain JavaScript in public/ so it's served at
// /sw.js (its scope is the whole site) and never fingerprinted or bundled.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Fantasy Dashboard', {
      body: data.body,
      tag: data.tag, // a newer reminder for the same league replaces the old one
      data,
      // Real reminders can be dismissed from the notification itself.
      actions: data.runAt ? [{ action: 'claims-set', title: 'Claims set' }] : [],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'claims-set') {
    // Same origin, so the session cookie goes along and the request is allowed.
    event.waitUntil(
      fetch('/api/waivers/claims', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: data.platform, leagueId: data.leagueId, runAt: data.runAt, set: true }),
      }),
    );
    return;
  }

  // Open the dashboard on that league's waivers, reusing an open tab if there is one.
  const url = new URL(data.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if ('focus' in tab) return tab.navigate(url).then((t) => (t || tab).focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
