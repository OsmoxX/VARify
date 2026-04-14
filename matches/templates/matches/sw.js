// Podstawowy Service Worker dla VARify
const CACHE_NAME = 'varify-cache-v1';

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Zainstalowany');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Aktywowany');
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Na razie tylko "przepuszczamy" żądania dalej. 
    // W przyszłości możemy tu dodać logikę działania offline!
    event.respondWith(fetch(event.request));
});