// ========================================================
// NOTIFICATION PANEL — globalny system powiadomień
// ========================================================

// --- Audio: generujemy dźwięk programowo (bez pliku mp3) ---
const NotifSound = {
    _ctx: null,
    play() {
        try {
            if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = this._ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);        // A5
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch(e) { /* brak audio — bez problemu */ }
    }
};

// --- localStorage: persistent notifications ---
const NOTIF_KEY = 'varify_notifications';
const UNREAD_KEY = 'varify_unread_count';

function getNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || []; }
    catch { return []; }
}

function saveNotifications(list) {
    // Max 50 powiadomień
    if (list.length > 50) list = list.slice(0, 50);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
}

function getUnreadCount() {
    return parseInt(localStorage.getItem(UNREAD_KEY) || '0', 10);
}

function setUnreadCount(n) {
    localStorage.setItem(UNREAD_KEY, String(Math.max(0, n)));
    renderBadge();
}

// --- Badge (czerwona kropka z liczbą) ---
function renderBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const count = getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// --- Render listy powiadomień ---
function renderNotifications() {
    const body = document.getElementById('notif-panel-body');
    const empty = document.getElementById('notif-empty');
    if (!body || !empty) return;
    const notifs = getNotifications();

    // Usuń stare elementy (ale zachowaj "empty" div)
    body.querySelectorAll('.notif-item').forEach(el => el.remove());

    if (notifs.length === 0) {
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    notifs.forEach((n, i) => {
        const item = document.createElement('div');
        item.className = 'notif-item' + (i < getUnreadCount() ? ' notif-unread' : '');
        item.innerHTML = `
            <span class="notif-icon">${n.icon || 'ℹ️'}</span>
            <div class="notif-content">
                <div class="notif-text">${n.message}</div>
                <div class="notif-time">${n.time || ''}</div>
            </div>
        `;
        body.appendChild(item);
    });
}

// --- API publiczne: dodawanie powiadomień (wywoływane z live_match_list.html) ---
window.VarifyNotif = {
    add(icon, message, eventType) {
        const notifs = getNotifications();
        const now = new Date();
        const time = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        notifs.unshift({ icon, message, eventType, time });
        saveNotifications(notifs);
        setUnreadCount(getUnreadCount() + 1);
        renderNotifications();
        NotifSound.play();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // --- Toggle panelu ---
    const bellBtn = document.getElementById('notif-bell-btn');
    const panel = document.getElementById('notif-panel');

    if (bellBtn && panel) {
        bellBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = panel.classList.toggle('notif-panel-open');
            if (isOpen) {
                setUnreadCount(0);
                renderNotifications();
            }
        });
    }

    // Zamknij panel kliknięciem poza nim
    document.addEventListener('click', function(e) {
        const wrapper = document.getElementById('notif-wrapper');
        if (wrapper && !wrapper.contains(e.target) && panel) {
            panel.classList.remove('notif-panel-open');
        }
    });

    // Wyczyść wszystkie
    const clearBtn = document.getElementById('notif-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            localStorage.removeItem(NOTIF_KEY);
            setUnreadCount(0);
            renderNotifications();
        });
    }

    // Init
    renderBadge();
    renderNotifications();

    // --- Wyszukiwarka (Enter) ---
    const searchInput = document.getElementById('live-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const query = this.value.trim();
            if (query.length < 2) return;
            window.location.href = `/search-api/?q=${encodeURIComponent(query)}`;
        });
    }

    // ──────────────────────────────────────────────────
    // USER AVATAR DROPDOWN
    // ──────────────────────────────────────────────────
    const userAvatarBtn = document.getElementById('user-avatar-btn');
    const userDropdown  = document.getElementById('user-dropdown');
    const userWrapper   = document.getElementById('user-menu-wrapper');

    if (userAvatarBtn && userDropdown) {
        userAvatarBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            userDropdown.classList.toggle('user-dropdown-open');
            // close notifications panel if open
            if (panel) panel.classList.remove('notif-panel-open');
        });

        document.addEventListener('click', function (e) {
            if (userWrapper && !userWrapper.contains(e.target)) {
                userDropdown.classList.remove('user-dropdown-open');
            }
        });
    }
});

// ========================================================
// GLOBALNY MENADŻER WEBSOCKETÓW — działa na każdej stronie
// ========================================================
const WS_SUBS_KEY = 'varify_ws_subs';
const _activeWS = {};

function getSubscribedWsIds() {
    try { return JSON.parse(localStorage.getItem(WS_SUBS_KEY)) || []; }
    catch { return []; }
}
function saveSubscribedWsIds(ids) {
    localStorage.setItem(WS_SUBS_KEY, JSON.stringify(ids));
}

function openMatchWS(matchId) {
    if (_activeWS[matchId] && _activeWS[matchId].readyState <= 1) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws/matches/${matchId}/`);
    ws.onopen = () => console.log(`🟢 [WS] connected: match ${matchId}`);
    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (window.VarifyNotif) window.VarifyNotif.add(data.icon, data.message, data.event_type);
        if (window.showMatchToast) window.showMatchToast(data.icon, data.message, data.event_type);
        if (window.updateMatchRow) window.updateMatchRow(matchId, data);
        if (data.is_ended) {
            window.VarifyWS.unsubscribe(matchId);
            const btn = document.querySelector(`.bell-btn[data-match-id="${matchId}"]`);
            if (btn) { btn.classList.remove('bell-active'); btn.title = 'Mecz zakończony'; btn.disabled = true; }
        }
    };
    ws.onclose = () => {
        delete _activeWS[matchId];
        if (getSubscribedWsIds().includes(matchId)) {
            setTimeout(() => openMatchWS(matchId), 3000);
        }
    };
    ws.onerror = () => ws.close();
    _activeWS[matchId] = ws;
}

function closeMatchWS(matchId) {
    if (_activeWS[matchId]) {
        _activeWS[matchId].onclose = null;
        _activeWS[matchId].close();
        delete _activeWS[matchId];
    }
}

window.VarifyWS = {
    subscribe(matchId) {
        const ids = getSubscribedWsIds();
        if (!ids.includes(matchId)) { ids.push(matchId); saveSubscribedWsIds(ids); }
        openMatchWS(matchId);
    },
    unsubscribe(matchId) {
        saveSubscribedWsIds(getSubscribedWsIds().filter(id => id !== matchId));
        closeMatchWS(matchId);
    },
    isSubscribed(matchId) { return getSubscribedWsIds().includes(matchId); },
    getIds()              { return getSubscribedWsIds(); },
};

(function pruneAndConnect() {
    const ids = getSubscribedWsIds();
    if (ids.length === 0) return;
    fetch('/api/active-match-ids/?ids=' + ids.join(','))
        .then(r => r.json())
        .then(data => {
            const activeIds = data.active_ids || [];
            saveSubscribedWsIds(activeIds);
            activeIds.forEach(id => openMatchWS(id));
        })
        .catch(() => ids.forEach(id => openMatchWS(id)));
})();
