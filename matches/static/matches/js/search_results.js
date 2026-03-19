document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') || '';

    if (query) {
        document.getElementById('search-title').innerHTML =
            `<i class="fa-solid fa-magnifying-glass"></i> Wyniki dla: "${query}"`;
    }

    fetch(`/api/search/?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
            const teams = data.teams || [];
            const players = data.players || [];

            const teamsHtml = teams.length > 0
                ? `<div class="search-results-list">
                    ${teams.map(t => `
                        <a href="/team/${t.id}/" class="search-result-card">
                            <div class="search-result-image-wrapper">
                                <i class="fa-solid fa-shield-halved team-fallback" style="color: var(--text-muted); font-size: 2rem; display: block;"></i>
                            </div>
                            <span class="search-result-name">${t.name}</span>
                        </a>`).join('')}
                    </div>`
                : `<p class="search-empty-state">Brak drużyn pasujących do zapytania.</p>`;

            const playersHtml = players.length > 0
                ? `<div class="search-results-list">
                    ${players.map(p => {
                        const displayName = (p.first_name || p.last_name)
                            ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
                            : p.name;
                        const posTag = p.position
                            ? `<div class="search-result-subtitle">${p.position}</div>`
                            : '';
                        return `
                            <a href="/player/${p.api_id}/" class="search-result-card">
                                <div class="search-result-image-wrapper player-wrapper">
                                    <i class="fa-solid fa-user player-fallback" style="color: var(--text-muted); font-size: 1.5rem; display: block;"></i>
                                </div>
                                <div class="search-result-info">
                                    <div class="search-result-name">${displayName}</div>
                                    ${posTag}
                                </div>
                            </a>`;
                    }).join('')}
                    </div>`
                : `<p class="search-empty-state">Brak zawodników pasujących do zapytania.</p>`;

            document.getElementById('search-results').innerHTML = `
                <h2 class="search-section-title">Drużyny</h2>
                ${teamsHtml}
                <h2 class="search-section-title">Zawodnicy</h2>
                ${playersHtml}
            `;
        })
        .catch(() => {
            document.getElementById('search-results').innerHTML =
                `<p class="search-empty-state">Błąd wyszukiwania. Spróbuj ponownie.</p>`;
        });
});
