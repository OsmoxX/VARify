document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.querySelector('.detail-wrapper');
    if (!wrapper || !wrapper.dataset.apiId) return;
    const LEAGUE_API_ID = wrapper.dataset.apiId;

    // ── Tab switch ──
    window.switchTab = function(tabId, btnContext) {
        document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const sel = document.getElementById('tab-' + tabId);
        if (sel) { sel.style.display = 'block'; setTimeout(() => sel.classList.add('active'), 10); }
        if (btnContext) btnContext.classList.add('active');
    };

    // ── Match row HTML ──
    function matchRowLink(m) {
        const img = (apiId) => `<img src="/api/image/team/${apiId}/" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;" onerror="this.style.display='none'">`;
        return `
            <a href="/match/${m.id}/" class="team-match-row">
                <div class="match-teams">
                    <span class="match-team-name home">${m.home_team} ${img(m.home_team_api_id)}</span>
                    <span class="match-score-box">${m.home_score} - ${m.away_score}</span>
                    <span class="match-team-name away">${img(m.away_team_api_id)} ${m.away_team}</span>
                </div>
            </a>`;
    }

    function upcomingRowHtml(m) {
        const img = (apiId) => `<img src="/api/image/team/${apiId}/" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;" onerror="this.style.display='none'">`;
        const dt = m.start_datetime ? new Date(m.start_datetime) : null;
        const label = dt ? `${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}` : '-';
        return `
            <div class="team-match-row">
                <div class="match-teams">
                    <span class="match-team-name home">${m.home_team} ${img(m.home_team_api_id)}</span>
                    <span class="match-score-box upcoming-score">${label}</span>
                    <span class="match-team-name away">${img(m.away_team_api_id)} ${m.away_team}</span>
                </div>
            </div>`;
    }

    // ── Fetch league info ──
    fetch(`/api/leagues/${LEAGUE_API_ID}/`)
        .then(r => r.ok ? r.json() : null)
        .then(league => {
            if (!league) return;
            document.getElementById('league-name').textContent = league.name;
            document.getElementById('league-country').textContent = league.country || 'Świat';
        });

    // ── Fetch standings ──
    let currentStandings = [];
    window.loadStandings = function(url) {
        if (!url) return;
        fetch(url)
            .then(r => r.json())
            .then(data => {
                const rows = data.results || data;
                currentStandings = currentStandings.concat(rows);
                const tbody = document.getElementById('standings-body');
                
                if (!currentStandings.length) {
                    tbody.innerHTML = `<tr><td colspan="9" class="empty-table">Brak danych o tabeli (jeszcze nie pobrano).</td></tr>`;
                    return;
                }
                
                let html = currentStandings.map(row => {
                    const gd = row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference;
                    return `
                        <tr>
                            <td class="col-pos">${row.position}</td>
                            <td class="col-team">
                                <a href="/team/${row.team_id}/" class="team-link">
                                    <img src="/api/image/team/${row.team_api_id}/" alt="${row.team}" class="team-icon" onerror="this.style.display='none'">
                                    ${row.team}
                                </a>
                            </td>
                            <td class="col-num">${row.matches_played}</td>
                            <td class="col-num">${row.matches_won}</td>
                            <td class="col-num">${row.matches_drawn}</td>
                            <td class="col-num">${row.matches_lost}</td>
                            <td class="col-num">${row.goals_for}:${row.goals_against}</td>
                            <td class="col-num">${gd}</td>
                            <td class="col-pts">${row.points}</td>
                        </tr>`;
                }).join('');
                
                if (data.next) {
                    html += `<tr><td colspan="9" style="text-align:center; padding: 10px;">
                        <button class="btn-load-more" onclick="loadStandings('${data.next}')">Pokaż więcej drużyn</button>
                    </td></tr>`;
                }
                tbody.innerHTML = html;
            });
    };
    loadStandings(`/api/leagues/${LEAGUE_API_ID}/standings/`);

    // ── Fetch upcoming + recent matches ──
    Promise.all([
        fetch(`/api/upcoming-matches/?league=${LEAGUE_API_ID}`).then(r => r.json()),
        fetch(`/api/live-matches/?league=${LEAGUE_API_ID}`).then(r => r.json()),
    ]).then(([upcomingData, recentData]) => {
        const upcoming = upcomingData.results || upcomingData;
        const recent = recentData.results || recentData;
        
        // Upcoming
        if (upcoming.length > 0) {
            document.getElementById('upcoming-section').style.display = 'block';
            document.getElementById('upcoming-matches-list').innerHTML = upcoming.slice(0, 10).map(upcomingRowHtml).join('');
        }
        // Recent (live + ended)
        const recentList = document.getElementById('recent-matches-list');
        if (recent.length > 0) {
            recentList.innerHTML = recent.slice(0, 10).map(matchRowLink).join('');
        } else {
            recentList.innerHTML = `<div class="empty-state-small"><i class="fa-solid fa-circle-info"></i> Brak rozegranych meczów na ten moment.</div>`;
        }
    });
});
