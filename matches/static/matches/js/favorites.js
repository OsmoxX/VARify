/**
 * favorites.js
 *
 * Handles "Toggle Favorite Team" via AJAX (Fetch API).
 *
 * Rules:
 *  - No inline CSS, no inline JS handlers.
 *  - Uses event delegation on document.
 *  - Reads team DB-id from data-team-id attribute.
 *  - Reads toggle URL from data-toggle-url attribute on the button.
 *  - Reads initial state from .is-favorite class on the button.
 *  - CSRF token is extracted from cookies (pure helper function).
 *  - On success, toggles .is-favorite class and plays a micro-animation.
 */

'use strict';

/* ──────────────────────────────────────────────
   Helper: get cookie value by name
   (used to extract Django's csrftoken)
────────────────────────────────────────────── */
function getCookie(name) {
    if (!document.cookie) return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (decodeURIComponent(key) === name) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

/* ──────────────────────────────────────────────
   Helper: play pop animation on a button
────────────────────────────────────────────── */
function playPopAnimation(btn) {
    btn.classList.remove('fav-pop');
    // Force reflow so animation restarts if clicked fast
    void btn.offsetWidth;
    btn.classList.add('fav-pop');
    btn.addEventListener(
        'animationend',
        () => btn.classList.remove('fav-pop'),
        { once: true }
    );
}

/* ──────────────────────────────────────────────
   Helper: update button visual state & tooltip
────────────────────────────────────────────── */
function updateButtonState(btn, isFavorite) {
    const icon = btn.querySelector('i');
    if (!icon) return;

    if (isFavorite) {
        btn.classList.add('is-favorite');
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        btn.dataset.tooltip = btn.dataset.tooltipRemove || 'Usuń z ulubionych';
    } else {
        btn.classList.remove('is-favorite');
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
        btn.dataset.tooltip = btn.dataset.tooltipAdd || 'Dodaj do ulubionych';
    }
}

/* ──────────────────────────────────────────────
   Core: toggle favorite via Fetch API
────────────────────────────────────────────── */
async function toggleFavorite(btn) {
    const teamId = btn.dataset.teamId;
    if (!teamId) {
        console.warn('[favorites.js] Missing data-team-id on button', btn);
        return;
    }

    const toggleUrl = `/favorite/toggle/${teamId}/`;
    const csrfToken = getCookie('csrftoken');

    if (!csrfToken) {
        console.error('[favorites.js] CSRF token not found. Is the user logged in?');
        return;
    }

    // Prevent double-clicks while request is in flight
    btn.classList.add('is-loading');

    try {
        const response = await fetch(toggleUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            updateButtonState(btn, data.is_favorite);
            playPopAnimation(btn);

            // Also update any *other* buttons on the page sharing the same team id
            // (e.g. one in the header, one in the standings table)
            syncAllButtonsForTeam(teamId, data.is_favorite, btn);

            // Dispatch custom event so other scripts (e.g. favorite_teams.js)
            // can react (e.g. animate card removal on the favorites page)
            document.dispatchEvent(new CustomEvent('favoriteToggled', {
                detail: { teamId, isFavorite: data.is_favorite, teamName: data.team_name }
            }));
        }
    } catch (err) {
        console.error('[favorites.js] Toggle request failed:', err);
    } finally {
        btn.classList.remove('is-loading');
    }
}

/* ──────────────────────────────────────────────
   Helper: keep all buttons for the same team in sync
────────────────────────────────────────────── */
function syncAllButtonsForTeam(teamId, isFavorite, originBtn) {
    document.querySelectorAll(`.toggle-favorite-btn[data-team-id="${teamId}"]`).forEach(btn => {
        if (btn === originBtn) return; // already updated
        updateButtonState(btn, isFavorite);
    });
}

/* ──────────────────────────────────────────────
   Event delegation — single listener on document
────────────────────────────────────────────── */
document.addEventListener('click', function handleFavoriteClick(event) {
    const btn = event.target.closest('.toggle-favorite-btn');
    if (!btn) return;

    // Stop parent anchor / link from navigating
    event.preventDefault();
    event.stopPropagation();

    toggleFavorite(btn);
});
