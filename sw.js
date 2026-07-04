// MedMitra service worker — handles background push notifications so
// shops/riders/customers get notified even when the browser tab or app is closed.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when the backend sends a push message via web-push
self.addEventListener('push', (event) => {
  let payload = { title: 'MedMitra', body: 'Naya update aaya hai', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    // fall back to default payload above
  }

  const options = {
    body: payload.body,
    icon: payload.icon || 'https://cdn-icons-png.flaticon.com/512/2965/2965567.png',
    badge: payload.icon || 'https://cdn-icons-png.flaticon.com/512/2965/2965567.png',
    vibrate: [200, 100, 200],
    data: { url: payload.url || '/' },
    tag: payload.tag || 'medmitra-order',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Clicking the notification focuses/opens the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
