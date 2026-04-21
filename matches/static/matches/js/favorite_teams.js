/**
 * favorite_teams.js
 *
 * Handles the "My Favorite Teams" page:
 *  - After a successful AJAX toggle (handled by favorites.js),
 *    if we're on the favorites page and the team is UNfavorited,
 *    the card smoothly fades out and is removed from the DOM.
 *  - Listens to a custom event dispatched by favorites.js.
 *
 * No inline CSS, no inline JS handlers.
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const favGrid = document.getElementById('fav-teams-grid');
    const emptyState = document.getElementById('fav-empty-state');

    if (!favGrid) return; // Not on the favorites page

    /* ──────────────────────────────────────────────────
       Listen to custom "favoriteToggled" events
       dispatched by favorites.js after each successful toggle
    ────────────────────────────────────────────────── */
    document.addEventListener('favoriteToggled', (event) => {
        const { teamId, isFavorite } = event.detail;

        if (!isFavorite) {
            // Find the card for this team and animate it out
            const card = favGrid.querySelector(`.fav-team-card[data-team-id="${teamId}"]`);
            if (!card) return;

            card.classList.add('removing');
            card.addEventListener('animationend', () => {
                card.remove();
                checkEmpty();
            }, { once: true });
        }
    });

    /* ──────────────────────────────────────────────────
       Show/hide empty state based on remaining cards
    ────────────────────────────────────────────────── */
    function checkEmpty() {
        const remaining = favGrid.querySelectorAll('.fav-team-card').length;
        if (remaining === 0 && emptyState) {
            emptyState.style.display = 'block';
            favGrid.style.display = 'none';
        }
        // Update count badge
        const badge = document.getElementById('fav-count-badge');
        if (badge) badge.textContent = remaining;
    }
});
