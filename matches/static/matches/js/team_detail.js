document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.querySelector('.detail-wrapper');
    if (!wrapper || !wrapper.dataset.apiId) return;
    const TEAM_API_ID = parseInt(wrapper.dataset.apiId, 10);

    // ── Tab switch ──
    window.switchTab = function(tabId, btnContext) {
        document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const sel = document.getElementById('tab-' + tabId);
        if (sel) { sel.style.display = 'block'; setTimeout(() => sel.classList.add('active'), 10); }
        if (btnContext) btnContext.classList.add('active');
    };

    // ── Team image helper ──
    const teamImg = (apiId) =>
        `<img src="/api/image/team/${apiId}/" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;" onerror="this.style.display='none'">`;

    // ── Fetch team info ──
    fetch(`/api/teams/${TEAM_API_ID}/`)
        .then(r => r.ok ? r.json() : null)
        .then(team => {
            if (!team) return;
            // Ustaw logo i pokaż je
            const logo = document.getElementById('team-logo');
            const fallback = document.getElementById('team-logo-fallback');
            logo.onerror = () => { logo.style.display = 'none'; fallback.style.display = 'flex'; };
            logo.onload = () => { logo.style.display = 'block'; fallback.style.display = 'none'; };
            logo.alt = team.name;
            logo.src = `/api/image/team/${team.api_id}/`;
            document.getElementById('team-name').textContent = team.name;
        });

    // ── Fetch matches ──
    let currentTeamMatches = [];
    window.loadTeamMatches = function(url) {
        if (!url) return;
        fetch(url)
            .then(r => r.json())
            .then(data => {
                const matches = data.results || data;
                currentTeamMatches = currentTeamMatches.concat(matches);
                const recentList = document.getElementById('recent-matches-list');

                if (!currentTeamMatches.length) {
                    recentList.innerHTML = `<div class="empty-state-small"><i class="fa-solid fa-circle-info"></i> Brak meczów w bazie danych.</div>`;
                    return;
                }

                let html = currentTeamMatches.map(m => {
                    const isHome = m.home_team_api_id === TEAM_API_ID;
                    const isAway = m.away_team_api_id === TEAM_API_ID;
                    const homeClass = isHome ? 'highlight' : '';
                    const awayClass = isAway ? 'highlight' : '';
                    const league = m.league_name ? `<span class="match-league-tag">${m.league_name}</span>` : '';
                    return `
                        <a href="/match/${m.id}/" class="team-match-row">
                            <div class="match-teams">
                                <span class="match-team-name home ${homeClass}">${m.home_team} ${teamImg(m.home_team_api_id)}</span>
                                <span class="match-score-box">${m.home_score} - ${m.away_score}</span>
                                <span class="match-team-name away ${awayClass}">${teamImg(m.away_team_api_id)} ${m.away_team}</span>
                            </div>
                            ${league}
                        </a>`;
                }).join('');
                
                if (data.next) {
                    html += `<button class="btn-load-more" onclick="loadTeamMatches('${data.next}')">Pokaż więcej meczów</button>`;
                }
                recentList.innerHTML = html;

                // ── Fetch lineups for last match that has one (only on first load) ──
                if (url === `/api/teams/${TEAM_API_ID}/matches/`) {
                    const firstMatch = matches[0];
                    if (firstMatch) {
                        fetch(`/api/live-matches/${firstMatch.id}/lineups/`)
                            .then(r => r.json())
                            .then(lineups => {
                                const isHomeTeam = firstMatch.home_team_api_id === TEAM_API_ID;
                                const squad = lineups.filter(p => p.is_home_team === isHomeTeam);
                                if (!squad.length) return;

                                const squadSection = document.getElementById('squad-section');
                                const squadGrid = document.getElementById('squad-grid');
                                squadSection.style.display = 'block';

                                // Update heading
                                squadSection.querySelector('h2').innerHTML =
                                    `<i class="fa-solid fa-users"></i> Skład (z meczu: ${firstMatch.home_team} vs ${firstMatch.away_team})`;

                                squadGrid.innerHTML = squad.map(p => {
                                    const captainBadge = p.is_captain ? `<span class="captain-badge">C</span>` : '';
                                    const posTag = p.position ? `<span class="pos-tag">${p.position}</span>` : '';
                                    const subBadge = !p.is_starting_xi ? `<span class="sub-badge">Rezerwowy</span>` : '';
                                    const rating = p.avg_rating ? `⭐ ${p.avg_rating}` : '';
                                    return `
                                        <div class="squad-player">
                                            <div class="squad-number">${p.shirt_number || '–'}</div>
                                            <div class="squad-player-info">
                                                <div class="squad-player-name">${p.player_name} ${captainBadge}</div>
                                                <div class="squad-player-meta">${posTag} ${subBadge} ${rating}</div>
                                            </div>
                                        </div>`;
                                }).join('');
                            })
                            .catch(() => {});
                    }
                }
            });
    };
    loadTeamMatches(`/api/teams/${TEAM_API_ID}/matches/`);

    // ── Fetch standings ──
    let currentTeamStandings = [];
    window.loadTeamStandings = function(url) {
        if (!url) return;
        fetch(url)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                const rows = data.results || data;
                currentTeamStandings = currentTeamStandings.concat(rows);
                const tbody = document.getElementById('standings-body');
                if (!currentTeamStandings.length) {
                    tbody.innerHTML = `<tr><td colspan="9" class="empty-table">Brak danych o tabeli (jeszcze nie pobrano).</td></tr>`;
                    return;
                }
                if (currentTeamStandings[0]?.league) {
                    document.getElementById('standings-league-name').textContent = currentTeamStandings[0].league;
                    document.getElementById('team-meta').textContent = `${currentTeamStandings[0].league}`;
                }
                let html = currentTeamStandings.map(row => {
                    const isCurrentTeam = row.team_api_id === TEAM_API_ID;
                    const gd = row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference;
                    return `
                        <tr class="${isCurrentTeam ? 'highlight-row' : ''}">
                            <td class="col-pos">${row.position}</td>
                            <td class="col-team">
                                <a href="/team/${row.team_api_id}/" class="team-link">
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
                        <button class="btn-load-more" onclick="loadTeamStandings('${data.next}')">Pokaż więcej drużyn</button>
                    </td></tr>`;
                }
                tbody.innerHTML = html;
            });
    };
    loadTeamStandings(`/api/teams/${TEAM_API_ID}/standings/`);
});
