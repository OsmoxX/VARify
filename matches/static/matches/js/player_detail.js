document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.calendar-container');
    if (!container || !container.dataset.apiId) return;
    const PLAYER_API_ID = parseInt(container.dataset.apiId, 10);

    function calcAge(dob) {
        if (!dob) return null;
        const today = new Date();
        const birth = new Date(dob);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    }

    function formatDate(d) {
        if (!d) return '-';
        const [y, m, day] = d.split('-');
        return `${day}.${m}.${y}`;
    }

    function footLabel(f) {
        if (f === 'Right') return 'Prawa';
        if (f === 'Left') return 'Lewa';
        if (f === 'Both') return 'Obie';
        return f || '-';
    }

    function statBox(label, value) {
        return `
        <div class="stat-box" style="background: var(--bg-color); padding: 15px; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 5px;">${label}</div>
            <div style="font-size: 1.2rem; font-weight: 700;">${value || '-'}</div>
        </div>`;
    }

    fetch(`/api/players/${PLAYER_API_ID}/`)
        .then(r => {
        if (!r.ok) throw new Error('Zawodnik nie znaleziony');
        return r.json();
        })
        .then(p => {
        const displayName = (p.first_name || p.last_name)
            ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
            : p.name;

        const age = calcAge(p.date_of_birth);

        const jerseyTag = p.jersey_number
            ? `<span style="background: var(--text-color); color: var(--bg-color); padding: 5px 12px; border-radius: 20px; font-weight: 800; font-size: 0.9rem;">#${p.jersey_number}</span>`
            : '';
        const posTag = p.position
            ? `<span style="background: var(--primary-color-alpha); color: var(--primary-color); padding: 5px 12px; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">${p.position}</span>`
            : '';
        const teamTag = p.team_name
            ? `<span style="background: var(--bg-color); padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border-color); font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;">
                ${p.team_name}
            </span>`
            : '';

        document.getElementById('player-content').innerHTML = `
            <div class="player-profile-card" style="background: var(--card-bg); border-radius: var(--border-radius-lg); padding: 30px; box-shadow: var(--box-shadow); border: 1px solid var(--border-color); color: var(--text-color); display: flex; gap: 30px; align-items: flex-start; flex-wrap: wrap;">

            <div class="player-avatar" style="flex-shrink: 0; width: 150px; height: 150px; border-radius: 50%; background: var(--bg-color); display: flex; align-items: center; justify-content: center; border: 3px solid var(--primary-color); overflow: hidden;">
                <img src="/api/image/player/${p.api_id}/" alt="${p.name}" style="width: 100%; height: 100%; object-fit: cover;"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <i class="fa-solid fa-user fallback-icon" style="font-size: 5rem; color: var(--text-muted); display: none;"></i>
            </div>

            <div class="player-info-main" style="flex: 1; min-width: 250px;">
                <h2 style="font-size: 2rem; margin: 0 0 10px 0; color: var(--text-color);">${displayName}</h2>

                <div class="player-tags" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                ${jerseyTag} ${posTag} ${teamTag}
                </div>

                <div class="player-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                ${statBox('Narodowość', p.nationality)}
                ${statBox('Wiek', age ? age + ' lat' : null)}
                ${statBox('Wzrost', p.height ? p.height + ' cm' : null)}
                ${statBox('Lepsza Noga', footLabel(p.preferred_foot))}
                ${statBox('Kontrakt do', formatDate(p.contract_until))}
                </div>
            </div>
            </div>`;
        })
        .catch(err => {
        document.getElementById('player-content').innerHTML = `
            <div class="no-matches-msg" style="text-align:center; padding: 40px;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: var(--danger-color); margin-bottom: 15px;"></i>
            <h2>${err.message || 'Nie znaleziono danych o zawodniku'}</h2>
            </div>`;
        });
});
