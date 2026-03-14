/**
 * calendar.js
 * Handles fetching, grouping, and rendering of upcoming matches calendar.
 */

// TOP LEAGUES (same order as in views.py TOP_LEAGUES_CONFIG)
const TOP_LEAGUES_CONFIG = [
    { id: '7',    name: 'UEFA Champions League',      country: 'Europa' },
    { id: '679',  name: 'UEFA Europa League',         country: 'Europa' },
    { id: '1703', name: 'UEFA Conference League',     country: 'Europa' },
    { id: '17',   name: 'Premier League',             country: 'England' },
    { id: '8',    name: 'LaLiga',                     country: 'Spain' },
    { id: '23',   name: 'Serie A',                    country: 'Italy' },
    { id: '35',   name: 'Bundesliga',                 country: 'Germany' },
    { id: '34',   name: 'Ligue 1',                    country: 'France' },
    { id: '202',  name: 'Ekstraklasa',                country: 'Poland' },
    { id: '37',   name: 'VriendenLoterij Eredivisie', country: 'Netherlands' },
    { id: '238',  name: 'Liga Portugal Betclic',      country: 'Portugal' },
    { id: '18',   name: 'Championship',               country: 'England' },
    { id: '52',   name: 'Trendyol Süper Lig',         country: 'Turkey' },
];

// ────────────────────────────────────────────────
// DOM BUILDERS
// ────────────────────────────────────────────────

function buildLeagueSection(league) {
    const section = document.createElement('div');
    section.className = 'league-section' + (league.isTop ? ' top-league' : '');
    section.setAttribute('data-league-name', league.displayName);

    const icon = league.isTop
        ? '<i class="fa-solid fa-star league-icon" style="color: var(--accent);"></i>'
        : '<i class="fa-solid fa-trophy league-icon"></i>';
    const countryTag = league.country ? `<span class="country-tag">• ${league.country}</span>` : '';

    let matchesHtml = '';
    if (league.matches && league.matches.length > 0) {
        league.matches.forEach(match => {
            matchesHtml += `
                <div class="match-row upcoming-match-row">
                    <div class="team team-home">${match.home_team}</div>
                    <div class="score-container">
                        <div class="kickoff-time">
                            <i class="fa-regular fa-clock"></i>
                            ${match.start_time}
                        </div>
                    </div>
                    <div class="team team-away">${match.away_team}</div>
                </div>
            `;
        });
    } else {
        matchesHtml = `
            <div class="no-matches-msg">
                <i class="fa-regular fa-calendar-xmark"></i>
                Brak meczów na dziś
            </div>
        `;
    }

    section.innerHTML = `
        <div class="league-header" onclick="toggleLeagueSection(this.parentElement)">
            <div class="league-info">
                ${icon}
                <span class="league-title">${league.name}</span>
                ${countryTag}
            </div>
            <i class="fa-solid fa-chevron-down chevron-icon"></i>
        </div>
        <div class="league-matches">
            ${matchesHtml}
        </div>
    `;
    return section;
}

// ────────────────────────────────────────────────
// FETCH UPCOMING MATCHES
// ────────────────────────────────────────────────

function loadUpcomingMatches() {
    fetch('/api/upcoming-matches/')
        .then(r => r.json())
        .then(matches => {
            const leagueMap = new Map();
            matches.forEach(match => {
                const key = match.league_api_id || match.league_name;
                if (!leagueMap.has(key)) {
                    const country = match.league_country || '';
                    const name = match.league_name || 'Nieznana';
                    leagueMap.set(key, {
                        id: key,
                        name,
                        country,
                        displayName: country ? `${name} • ${country}` : name,
                        isTop: match.is_top,
                        matches: [],
                    });
                }
                leagueMap.get(key).matches.push(match);
            });

            const orderedLeagues = [];
            const remainingMap = new Map(leagueMap);

            TOP_LEAGUES_CONFIG.forEach(cfg => {
                const data = remainingMap.get(cfg.id);
                const name = data ? data.name : cfg.name;
                orderedLeagues.push({
                    id: cfg.id,
                    name,
                    country: cfg.country,
                    displayName: `${name} • ${cfg.country}`,
                    isTop: true,
                    matches: data ? data.matches : [],
                });
                remainingMap.delete(cfg.id);
            });

            [...remainingMap.values()]
                .filter(l => l.isTop)
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(l => orderedLeagues.push(l));

            [...remainingMap.values()]
                .filter(l => !l.isTop)
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(l => orderedLeagues.push(l));

            renderCalendar(orderedLeagues);
            document.getElementById('loading-state')?.remove();
        })
        .catch(err => {
            console.error('Błąd fetch upcoming matches:', err);
            document.getElementById('calendar-container').innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Błąd ładowania meczów. Spróbuj odświeżyć stronę.</p>
                </div>`;
        });
}

function renderCalendar(leagueList) {
    const container = document.getElementById('calendar-container');
    container.innerHTML = '';
    if (leagueList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>Brak nadchodzących meczów. Uruchom synchronizację.</p>
            </div>`;
        return;
    }
    leagueList.forEach(league => container.appendChild(buildLeagueSection(league)));
    rebuildFilterList(leagueList.filter(l => l.matches.length > 0).map(l => l.displayName));
}

// ────────────────────────────────────────────────
// FILTER UI
// ────────────────────────────────────────────────

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

// START
loadUpcomingMatches();
