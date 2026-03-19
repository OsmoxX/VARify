/**
 * live_matches.js
 * Handles fetching, rendering and real-time updating of live match list.
 * Expects `window.serverSubscribedIds` to be set BEFORE this script loads
 * (injected as an inline <script> block in live_match_list.html).
 */

// ────────────────────────────────────────────────
// CSRF HELPER
// ────────────────────────────────────────────────

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// ────────────────────────────────────────────────
// STATUS LABELS & CLASSES
// ────────────────────────────────────────────────

const STATUS_MAP = {
    '1st half':              '1. połowa',
    '2nd half':              '2. połowa',
    'halftime':              'Przerwa',
    'ended':                 'Zakończony',
    'not started':           'Nie rozpoczęty',
    'extra time 1st half':   'Dogrywka 1H',
    'extra time 2nd half':   'Dogrywka 2H',
    '1st extra':             'Dogrywka 1H',
    '2nd extra':             'Dogrywka 2H',
    'awaiting extra time':   'Oczekuje na dogrywkę',
    'awaiting penalties':    'Oczekuje na karne',
    'extra time halftime':   'Przerwa dogrywki',
    'after extra time':      'Po dogrywce',
    'after penalties':       'Po karnych',
    'penalties':             'Karne',
    'postponed':             'Przełożony',
    'canceled':              'Odwołany',
    'cancelled':             'Odwołany',
    'abandoned':             'Przerwany',
    'awarded':               'Walkower',
};
const LIVE_STATUSES = ['1st half', '2nd half', 'extra time 1st half', 'extra time 2nd half', '1st extra', '2nd extra', 'penalties'];
const BREAK_STATUSES = ['halftime', 'extra time halftime', 'awaiting extra time', 'awaiting penalties'];

function getStatusClass(raw) {
    if (LIVE_STATUSES.includes(raw)) return 'status-live';
    if (BREAK_STATUSES.includes(raw)) return 'status-break';
    return 'status-ended';
}

// ────────────────────────────────────────────────
// DOM BUILDERS
// ────────────────────────────────────────────────

function buildLeagueSection(leagueName, country, displayName, isTop, matches) {
    const section = document.createElement('div');
    section.className = 'league-section' + (isTop ? ' top-league' : '');
    section.setAttribute('data-league-name', displayName);
    section.setAttribute('data-is-top', isTop ? '1' : '0');

    const icon = isTop
        ? '<i class="fa-solid fa-star league-icon top-icon" style="color: var(--accent);"></i>'
        : '<i class="fa-solid fa-trophy league-icon"></i>';
    const countryTag = country ? `<span class="country-tag">• ${country}</span>` : '';

    section.innerHTML = `
        <div class="league-header" onclick="toggleLeagueSection(this.parentElement)">
            <div class="league-info">
                ${icon}
                <span class="league-title">${leagueName}</span>
                ${countryTag}
            </div>
            <i class="fa-solid fa-chevron-down chevron-icon"></i>
        </div>
        <div class="league-matches" id="matches-${CSS.escape(displayName)}"></div>
    `;

    const matchesContainer = section.querySelector('.league-matches');
    matches.forEach(match => matchesContainer.appendChild(buildMatchRow(match)));
    return section;
}

function buildMatchRow(match) {
    const raw = (match.status || '').toLowerCase().trim();
    const statusLabel = STATUS_MAP[raw] || match.status;
    const statusClass = getStatusClass(raw);
    const isBellActive = window.VarifyWS && window.VarifyWS.isSubscribed(match.api_id) ? 'bell-active' : '';

    const wrapper = document.createElement('div');
    wrapper.className = 'match-row-wrapper';
    wrapper.setAttribute('data-match-id', match.api_id);
    wrapper.innerHTML = `
        <a href="${match.match_url || '#'}" class="match-row">
            <div class="team team-home">${match.home_team}</div>
            <div class="score-container">
                <div class="score-display">${match.home_score} - ${match.away_score}</div>
                <div class="match-status-label ${statusClass}" data-status="${match.status}">
                    ${statusLabel}
                </div>
            </div>
            <div class="team team-away">${match.away_team}</div>
        </a>
        <button class="bell-btn ${isBellActive}" data-match-id="${match.api_id}"
            title="${isBellActive ? 'Wyłącz powiadomienia' : 'Włącz powiadomienia'}"
            aria-label="Włącz powiadomienia">
            <i class="fa-solid fa-bell"></i>
        </button>
    `;

    const btn = wrapper.querySelector('.bell-btn');
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const matchId = parseInt(btn.dataset.matchId, 10);
        fetch('/toggle-notifications/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ match_id: matchId })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'added') {
                btn.classList.add('bell-active');
                btn.title = 'Wyłącz powiadomienia';
                showMatchToast('🔔', 'Powiadomienia włączone', 'info');
                if (window.VarifyWS) window.VarifyWS.subscribe(matchId);
            } else if (data.status === 'removed') {
                btn.classList.remove('bell-active');
                btn.title = 'Włącz powiadomienia';
                showMatchToast('🔕', 'Powiadomienia wyłączone', 'info');
                if (window.VarifyWS) window.VarifyWS.unsubscribe(matchId);
            } else {
                showMatchToast('❌', data.message || 'Błąd', 'error');
            }
        })
        .catch(() => showMatchToast('❌', 'Błąd połączenia. Spróbuj ponownie.', 'error'));
    });

    return wrapper;
}

// ────────────────────────────────────────────────
// FETCH LIVE MATCHES (BEZ PAGINACJI)
// ────────────────────────────────────────────────

function loadLiveMatches(silent = false) {
    if (!silent) showLoading();

    fetch('/api/live-matches/')
        .then(r => r.json())
        .then(matchesArray => {
            const leagueMap = new Map();
            
            matchesArray.forEach(match => {
                let name = match.league_name || 'Nieznana';
                let key = match.league_api_id ? String(match.league_api_id) : name;

                // --- PANCERNY FALLBACK ---
                if (key === '7' || name.includes('UEFA Champions League')) {
                    key = '7';
                    name = 'Champions League';
                }
                else if (key === '679' || name.includes('UEFA Europa League')) {
                    key = '679';
                    name = 'Europa League';
                }
                else if (key === '1703' || name.includes('UEFA Europa Conference') || name.includes('UEFA Conference')) {
                    key = '1703';
                    name = 'Conference League';
                }
                else if (key === '202' || name.includes('Ekstraklasa')) {
                    key = '202';
                }

                if (!leagueMap.has(key)) {
                    const country = match.league_country || match.country_name || '';
                    leagueMap.set(key, {
                        name: name,
                        country: country,
                        displayName: country ? `${name} • ${country}` : name,
                        isTop: match.is_top,
                        matches: [],
                    });
                } else if (match.is_top) {
                    leagueMap.get(key).isTop = true;
                }
                leagueMap.get(key).matches.push(match);
            });

            // Sortowanie: najpierw Top Ligi (alfabetycznie), potem reszta (alfabetycznie)
            const sorted = [...leagueMap.values()].sort((a, b) => {
                if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            renderLeagues(sorted);
            if (!silent) hideLoading();
        })
        .catch(err => {
            console.error('Błąd fetch live matches:', err);
            if (!silent) showError();
        });
}

// ────────────────────────────────────────────────
// RENDER LEAGUES
// ────────────────────────────────────────────────

function renderLeagues(leagueList) {
    const container = document.getElementById('leagues-container');

    const collapsed = new Set();
    container.querySelectorAll('.league-section.collapsed').forEach(s => {
        collapsed.add(s.getAttribute('data-league-name'));
    });

    container.innerHTML = '';

    if (leagueList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-circle-nodes"></i>
                <p>Brak meczów na żywo w tym momencie.</p>
            </div>`;
        return;
    }

    let dividerAdded = false;
    leagueList.forEach(league => {
        if (!league.isTop && !dividerAdded) {
            const sep = document.createElement('div');
            sep.className = 'other-leagues-divider';
            sep.innerHTML = '<span>Inne ligi</span>';
            container.appendChild(sep);
            dividerAdded = true;
        }

        const section = buildLeagueSection(
            league.name, league.country, league.displayName, league.isTop, league.matches
        );
        if (collapsed.has(league.displayName)) {
            section.classList.add('collapsed');
        }
        container.appendChild(section);
    });

    rebuildFilterList(leagueList.map(l => l.displayName));
    initBells();
}

// ────────────────────────────────────────────────
// UI UTILS
// ────────────────────────────────────────────────

function showLoading() {
    const container = document.getElementById('leagues-container');
    if (!document.getElementById('loading-state')) {
        container.insertAdjacentHTML('beforeend', `
            <div class="loading-state" id="loading-state">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <p>Ładowanie meczów...</p>
            </div>
        `);
    }
}

function hideLoading() {
    const el = document.getElementById('loading-state');
    if (el) el.remove();
}

function showError() {
    const container = document.getElementById('leagues-container');
    container.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>Błąd ładowania meczów. Spróbuj odświeżyć stronę.</p>
        </div>`;
}

// ────────────────────────────────────────────────
// FILTER & NOTIFICATION LOGIC
// ────────────────────────────────────────────────

function initBells() {
    let serverSubscribedIds = [];
    try {
        const scriptData = document.getElementById('subscribed-leagues-data');
        if (scriptData) {
            serverSubscribedIds = JSON.parse(scriptData.textContent);
        }
    } catch (e) {
        console.error("Error parsing subscribed leagues", e);
    }
    serverSubscribedIds.forEach(function(apiId) {
        if (window.VarifyWS && !window.VarifyWS.isSubscribed(apiId)) {
            window.VarifyWS.subscribe(apiId);
        }
    });
    if (window.VarifyWS) {
        window.VarifyWS.getIds().forEach(function(apiId) {
            const btn = document.querySelector('.bell-btn[data-match-id="' + apiId + '"]');
            if (btn) {
                btn.classList.add('bell-active');
                btn.title = 'Wyłącz powiadomienia';
            }
        });
    }
}

window.showMatchToast = function showMatchToast(icon, msg, eventType) {
    const bgColors = {
        goal: '#22c55e', card: '#eab308', substitution: '#3b82f6',
        period: '#8b5cf6', info: '#6366f1', error: '#ef4444',
    };
    const bg = bgColors[eventType] || '#333';
    const existing = document.querySelector('.varify-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'varify-toast';
    toast.innerHTML = `<span style="font-size:1.3rem;margin-right:8px;">${icon}</span> ${msg}`;
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: ${bg}; color: #fff;
        padding: 14px 28px; border-radius: 12px; font-weight: 600;
        font-size: 0.95rem; z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
        animation: toastIn 0.3s ease;
        display: flex; align-items: center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; }, 4000);
    setTimeout(() => toast.remove(), 4500);
};

window.updateMatchRow = function updateMatchRow(matchId, data) {
    const wrapper = document.querySelector('.match-row-wrapper[data-match-id="' + matchId + '"]');
    if (!wrapper) return;

    if (data.home_score !== undefined && data.away_score !== undefined) {
        const scoreEl = wrapper.querySelector('.score-display');
        if (scoreEl) {
            scoreEl.textContent = data.home_score + ' - ' + data.away_score;
            scoreEl.style.transition = 'color 0.3s, transform 0.3s';
            scoreEl.style.color = '#10b981';
            scoreEl.style.transform = 'scale(1.3)';
            setTimeout(function() {
                scoreEl.style.color = '';
                scoreEl.style.transform = '';
            }, 1500);
        }
    }

    if (data.status) {
        const statusEl = wrapper.querySelector('.match-status-label');
        if (statusEl) {
            const raw = data.status.toLowerCase().trim();
            statusEl.textContent = STATUS_MAP[raw] || data.status;
            statusEl.dataset.status = data.status;
            statusEl.classList.remove('status-live', 'status-break', 'status-ended');
            statusEl.classList.add(getStatusClass(raw));
        }
    }
};

function rebuildFilterList(leagueNames) {
    const filterList = document.getElementById('league-filter-list');
    filterList.innerHTML = '';
    leagueNames.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label league-filter-item';
        label.setAttribute('data-league-lower', name.toLowerCase());
        label.innerHTML = `
            <input type="checkbox" checked class="league-filter-cb" onchange="applyFilters()"
                data-league="${name}">
            <span class="league-filter-name">${name}</span>
        `;
        filterList.appendChild(label);
    });
}

function toggleFilterMenu() {
    const menu = document.getElementById('filter-menu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function filterLeagueCheckboxes(query) {
    const q = query.trim().toLowerCase();
    const items = document.querySelectorAll('.league-filter-item');
    let visibleCount = 0;
    items.forEach(item => {
        const name = item.getAttribute('data-league-lower');
        const match = !q || name.includes(q);
        item.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
    });
    document.getElementById('filter-no-results').style.display = visibleCount === 0 ? 'block' : 'none';
}

function selectAllVisible() {
    document.querySelectorAll('.league-filter-item').forEach(item => {
        if (item.style.display !== 'none') item.querySelector('.league-filter-cb').checked = true;
    });
    applyFilters();
}

function deselectAllVisible() {
    document.querySelectorAll('.league-filter-item').forEach(item => {
        if (item.style.display !== 'none') item.querySelector('.league-filter-cb').checked = false;
    });
    applyFilters();
}

function applyFilters() {
    const checkboxes = document.querySelectorAll('.league-filter-cb');
    const sections = document.querySelectorAll('.league-section');
    checkboxes.forEach(cb => {
        const leagueName = cb.getAttribute('data-league');
        sections.forEach(section => {
            if (section.getAttribute('data-league-name') === leagueName) {
                section.style.display = cb.checked ? 'block' : 'none';
            }
        });
    });
}

function toggleLeagueSection(section) {
    section.classList.toggle('collapsed');
}

function toggleAllLeagues(checkbox) {
    document.querySelectorAll('.league-section').forEach(section => {
        if (checkbox.checked) section.classList.remove('collapsed');
        else section.classList.add('collapsed');
    });
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('filter-menu');
    const btn = document.querySelector('.filter-btn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ────────────────────────────────────────────────
// START + AUTO-REFRESH
// ────────────────────────────────────────────────
loadLiveMatches();
setInterval(() => loadLiveMatches(true), 30000);