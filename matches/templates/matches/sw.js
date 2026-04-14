const CACHE_NAME = 'varify-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// --- OBSŁUGA POWIADOMIEŃ PUSH ---
self.addEventListener('push', function (event) {
    console.log('[Service Worker] Odebrano sygnał Push');

    let data = {};
    if (event.data) {
        try {
            // Próbujemy odczytać dane jako JSON
            data = event.data.json();
        } catch (e) {
            // Jeśli to nie JSON, traktujemy to jako zwykły tekst
            data = { title: "VARify", body: event.data.text() };
        }
    }

    const title = data.head || data.title || 'VARify - Nowa bramka!';
    const options = {
        body: data.body || 'Sprawdź aktualny wynik meczu.',
        icon: '/static/matches/icon-192x192.png',
        badge: '/static/matches/icon-192x192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/' // Adres, na który ma przenieść po kliknięciu
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// --- CO SIĘ DZIEJE PO KLIKNIĘCIU W POWIADOMIENIE ---
self.addEventListener('notificationclick', function (event) {
    event.notification.close(); // Zamknij powiadomienie
    
    // Otwórz stronę aplikacji
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});

