/* VARify Service Worker — Web Push (odpowiednik Django sw.js + django-webpush) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'VARify', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // Gdy karta jest widoczna, użytkownik widzi już toast z WebSocketu — nie dublujemy.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === 'visible')) return;
      await self.registration.showNotification(data.title || 'VARify', {
        body: data.body || '',
        tag: data.key || undefined, // ten sam tag = jedno powiadomienie (brak duplikatów)
        data: { url: data.url || '/' },
        vibrate: [200, 100, 200],
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
