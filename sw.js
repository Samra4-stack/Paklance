// Paklance Service Worker — Web Push Notifications
// Handles push events when the page is in the background or closed.

const CACHE_NAME = 'paklance-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Push event: show the notification ──────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Paklance', body: event.data ? event.data.text() : 'New message' };
  }

  const title = data.title || 'Paklance';
  const options = {
    body: data.body || 'You have a new message.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'paklance-msg',
    renotify: true,
    requireInteraction: false,
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click: open/focus the app and navigate ────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  // Navigate to messages view; include senderId so the app opens that chat
  const targetUrl = notifData.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a Paklance window is already open, focus it and post a message
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          const swOrigin = self.location.origin;
          if (clientUrl.origin === swOrigin) {
            client.focus();
            client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', data: notifData });
            return;
          }
        } catch {}
      }
      // Otherwise open a new tab
      return clients.openWindow(targetUrl);
    })
  );
});
