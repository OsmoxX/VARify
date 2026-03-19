window.openTab = function(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-btn");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.style.display = "block";
    if (evt && evt.currentTarget) evt.currentTarget.className += " active";
};

window.openPeriod = function(evt, periodId) {
    var panels = document.getElementsByClassName("stats-period-panel");
    for (var i = 0; i < panels.length; i++) {
        panels[i].style.display = "none";
    }
    var btns = document.getElementsByClassName("period-btn");
    for (var i = 0; i < btns.length; i++) {
        btns[i].className = btns[i].className.replace(" active", "");
    }
    const targetPeriod = document.getElementById(periodId);
    if (targetPeriod) targetPeriod.style.display = "block";
    if (evt && evt.currentTarget) evt.currentTarget.className += " active";
};

// ========================================================
// ZEGAR MECZU – liczy minuty na stronie szczegółów
// ========================================================
const LIVE_KW   = ['half', 'live', 'progress', 'period', '1st', '2nd', 'extra', 'overtime'];
// Statusy PAUZY: sprawdzane PRZED LIVE_KW — muszą zatrzymać timer
const PAUSED_KW = ['halftime', 'half time', 'ht', 'pause', 'break'];

function updateMatchClock() {
    const el = document.getElementById('match-clock');
    if (!el) return;

    const periodStart = parseInt(el.dataset.periodStart, 10) || 0;
    const initialMin  = parseInt(el.dataset.initialMin, 10) || 0;
    const baseMins    = parseInt(el.dataset.minute, 10) || 0;
    const status      = (el.dataset.status || '').toLowerCase();
    const clockText   = document.getElementById('clock-text');
    if (!clockText) return;

    // Najpierw sprawdź pauzę — jeśli przerwa, pokazuj HT i nie licz dalej
    const isPaused = PAUSED_KW.some(kw => status.includes(kw));
    if (isPaused) {
        clockText.textContent = 'HT';
        return;
    }

    // Sprawdzamy czy mecz jest live (live, 1st, 2nd itp.)
    const isLive = LIVE_KW.some(kw => status.includes(kw));

    if (!isLive) {
        return;
    }

    const nowSec = Math.floor(Date.now() / 1000);

    let currentMin;
    if (periodStart > 0) {
        // Dokładna metoda: tak samo jak API
        const elapsedSecs = nowSec - periodStart;
        currentMin = initialMin + Math.floor(elapsedSecs / 60);
        const secs = elapsedSecs % 60;

        if (currentMin > 90 && !status.includes('extra')) {
            const injuryMin = currentMin - 90;
            clockText.textContent = `90+${injuryMin}:${String(secs).padStart(2, '0')}`;
        } else if (currentMin > 45 && initialMin === 0) {
            // Doliczony czas 1. połowy
            const injuryMin = currentMin - 45;
            clockText.textContent = `45+${injuryMin}:${String(secs).padStart(2, '0')}`;
        } else {
            clockText.textContent = currentMin + ':' + String(secs).padStart(2, '0');
        }
    } else {
        // Fallback: baseMins bez sekundomierza
        clockText.textContent = baseMins + ':00';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateMatchClock();
    setInterval(updateMatchClock, 1000);
});
