/**
 * match_ws_worker.js — SharedWorker zarządzający połączeniami WebSocket.
 *
 * Żyje niezależnie od kart/stron: jedno połączenie WS na mecz, współdzielone
 * przez wszystkie zakładki i podstrony tej samej domeny.
 *
 * Protokół wiadomości (page → worker):
 *   { action: 'subscribe',   matchId: <int> }
 *   { action: 'unsubscribe', matchId: <int> }
 *   { action: 'init' }          → worker odsyła listę aktywnych subskrypcji
 *
 * Protokół wiadomości (worker → page):
 *   { type: 'ws_message', matchId: <int>, data: <object> }
 *   { type: 'subscribed',  ids: [<int>, ...] }            → odpowiedź na 'init'
 *   { type: 'status',      matchId: <int>, status: 'connected'|'disconnected' }
 */

'use strict';

/** Mapa matchId → WebSocket */
const sockets = new Map();

/** Zbiór wszystkich podłączonych portów (zakładek / stron) */
const ports = new Set();

/** Zbiór ID meczów, które chcemy obserwować */
const subscribed = new Set();

// ── Obsługa nowej zakładki / podstrony łączącej się z workerem ──────────────
onconnect = function (event) {
    const port = event.ports[0];
    ports.add(port);

    port.onmessage = function (e) {
        const { action, matchId } = e.data;

        if (action === 'init') {
            // Wyślij powrotem listę aktywnych subskrypcji
            port.postMessage({ type: 'subscribed', ids: [...subscribed] });
            return;
        }

        if (action === 'subscribe' && matchId != null) {
            subscribed.add(matchId);
            openSocket(matchId);
            return;
        }

        if (action === 'unsubscribe' && matchId != null) {
            subscribed.delete(matchId);
            closeSocket(matchId);
            return;
        }
    };

    // Gdy zakładka jest zamknięta przeglądarka może (ale nie musi) wywołać
    // port.onclose – zależy od implementacji. Obsługujemy to defensywnie.
    port.onclose = function () {
        ports.delete(port);
    };

    port.start();
};

// ── Otwieranie połączenia WS ─────────────────────────────────────────────────
function openSocket(matchId) {
    if (sockets.has(matchId)) return; // już otwarte lub w trakcie

    const scheme = self.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${self.location.host}/ws/matches/${matchId}/`);

    ws.onopen = function () {
        broadcast({ type: 'status', matchId, status: 'connected' });
    };

    ws.onmessage = function (e) {
        try {
            const data = JSON.parse(e.data);
            broadcast({ type: 'ws_message', matchId, data });

            // Mecz zakończony → automatycznie odsubskrybuj
            if (data.is_ended) {
                subscribed.delete(matchId);
                closeSocket(matchId);
            }
        } catch (_) {}
    };

    ws.onclose = function () {
        sockets.delete(matchId);
        broadcast({ type: 'status', matchId, status: 'disconnected' });

        // Auto-reconnect jeśli nadal subskrybowany (np. chwilowe zerwanie sieci)
        if (subscribed.has(matchId)) {
            setTimeout(() => openSocket(matchId), 3000);
        }
    };

    ws.onerror = function () {
        ws.close();
    };

    sockets.set(matchId, ws);
}

// ── Zamykanie połączenia WS ──────────────────────────────────────────────────
function closeSocket(matchId) {
    const ws = sockets.get(matchId);
    if (!ws) return;
    ws.onclose = null; // nie chcemy auto-reconnect po ręcznym zamknięciu
    ws.close();
    sockets.delete(matchId);
}

// ── Broadcast do wszystkich podłączonych portów ──────────────────────────────
function broadcast(message) {
    for (const port of ports) {
        try {
            port.postMessage(message);
        } catch (_) {
            // Port mógł zostać zamknięty — usuń go cicho
            ports.delete(port);
        }
    }
}
