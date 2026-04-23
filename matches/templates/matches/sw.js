/**
 * sw.js – VARify Service Worker
 *
 * Strategie cache:
 *   • Nawigacja (HTML) i API/JSON  → Network First (zawsze próbuj sieci; fallback do cache)
 *   • Statyczne zasoby (CSS/JS/IMG) → Cache First (z odświeżaniem w tle)
 *
 * Dzięki temu:
 *   – Stan dzwoneczka jest zawsze aktualny (nie pochodzi ze starego HTML-a cache)
 *   – Zdarzenia meczowe (gole) pojawiają się od razu przy pierwszym otwarciu
 *   – Aplikacja działa offline dla statycznych zasobów
 */

const CACHE_NAME = 'varify-static-v2';
const DYNAMIC_CACHE = 'varify-dynamic-v2';

// Zasoby, które chcemy pre-keszować przy instalacji
const PRE_CACHE_URLS = [
    '/static/matches/icon-192x192.png',
];

// Wzorce URL, które ZAWSZE traktujemy jako Network First
const NETWORK_FIRST_PATTERNS = [
    /\/api\//,           // wszystkie API endpointy (/api/live-matches/, /api/teams/ itp.)
    /\/toggle-notifications\//,
    /\/match\/\d+\//,    // strony szczegółów meczu (zmieniają się w czasie rzeczywistym)
    /\/pl\//,            // strony nawigacyjne (zawierają stan subscribptions)
    /\/en\//,
    /\/admin\//,
];

// ────────────────────────────────────────────────────────────
//  INSTALL – pre-keszowanie statycznych zasobów
// ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(PRE_CACHE_URLS).catch(() => {
                // Nie blokuj instalacji jeśli icon nie jest dostępny
            });
        })
    );
});

// ────────────────────────────────────────────────────────────
//  ACTIVATE – usuń stare wersje cache
// ────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

// ────────────────────────────────────────────────────────────
//  FETCH – główna logika strategii cache
// ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Pomijaj request'y nie-GET i cross-origin
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    const isNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname));
    const isStaticAsset = url.pathname.startsWith('/static/');

    if (isNetworkFirst) {
        // ── NETWORK FIRST ───────────────────────────────────
        // Zawsze próbuj sieci; zapisz w dynamic cache; fallback do cache jeśli offline
        event.respondWith(networkFirst(request));
    } else if (isStaticAsset) {
        // ── CACHE FIRST ──────────────────────────────────────
        // CSS, JS, obrazki: serwuj z cache, odświeżaj w tle (Stale-While-Revalidate)
        event.respondWith(cacheFirst(request));
    }
    // Inne requesty (zewnętrzne itp.) – przeglądarka obsługuje domyślnie
});

async function networkFirst(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            // Klonowanie odpowiedzi konieczne – body można odczytać tylko raz
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (_err) {
        // Brak sieci – sprawdź cache
        const cached = await cache.match(request);
        if (cached) return cached;
        // Absolutny fallback dla nawigacji HTML
        if (request.mode === 'navigate') {
            const rootCached = await cache.match('/');
            if (rootCached) return rootCached;
        }
        return new Response('Offline – brak dostępu do sieci', { status: 503 });
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
        // Odśwież w tle (Stale-While-Revalidate)
        fetch(request).then(resp => {
            if (resp && resp.status === 200) cache.put(request, resp);
        }).catch(() => {});
        return cached;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (_err) {
        return new Response('Asset nie dostępny offline', { status: 503 });
    }
}

// ────────────────────────────────────────────────────────────
//  PUSH – obsługa przychodzących notyfikacji
// ────────────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
    console.log('[SW] Odebrano sygnał Push');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'VARify', body: event.data.text() };
        }
    }

    const title = data.head || data.title || 'VARify - Nowa bramka!';
    const options = {
        body: data.body || 'Sprawdź aktualny wynik meczu.',
        icon: '/static/matches/icon-192x192.png',
        badge: '/static/matches/icon-192x192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ────────────────────────────────────────────────────────────
//  NOTIFICATION CLICK – otwarcie strony po kliknięciu
// ────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    
    // Pobieramy URL z danych powiadomienia
    let targetUrl = event.notification.data.url;

    // 1. Jeśli URL jest relatywny (zaczyna się od /), doklejamy origin (domenę)
    if (targetUrl.startsWith('/')) {
        targetUrl = self.location.origin + targetUrl;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // 2. Szukamy czy użytkownik ma już otwartą TĘ KONKRETNĄ stronę
            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // 3. Jeśli nie, sprawdzamy czy ma otwartą JAKĄKOLWIEK stronę naszej apki
            // i przekierowujemy ją, zamiast otwierać nowe okno (opcjonalne, ale lepsze UX)
            if (clientList.length > 0) {
                let client = clientList[0];
                if ('navigate' in client) {
                    client.focus();
                    return client.navigate(targetUrl);
                }
            }
            
            // 4. Jeśli nic nie jest otwarte – otwieramy nowe okno
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
