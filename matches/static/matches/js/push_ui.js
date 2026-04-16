document.addEventListener('DOMContentLoaded', () => {
    const hiddenOriginalBtn = document.getElementById('webpush-subscribe-button');
    const customModal       = document.getElementById('push-custom-modal');
    const acceptBtn         = document.getElementById('push-accept-btn');
    const laterBtn          = document.getElementById('push-later-btn');
    const settingsToggle    = document.getElementById('push-settings-toggle');

    const DISMISSED_KEY  = 'push_prompt_dismissed';
    const COOLDOWN_MS    = 24 * 60 * 60 * 1000; // 24 h
    const WEBPUSH_SCOPE  = '/webpush/';

    // ── Pomocnicze ────────────────────────────────────────────────────────────

    function dismissPrompt() {
        localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    }

    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    }

    function isPushSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window;
    }

    // ── Pobierz rejestrację SW i subskrypcję ─────────────────────────────────

    async function getWebPushSubscription() {
        const reg = await navigator.serviceWorker.getRegistration(WEBPUSH_SCOPE);
        if (!reg) return null;
        return reg.pushManager.getSubscription();
    }

    // ── Synchronizacja stanu suwaka z rzeczywistą subskrypcją ────────────────

    async function syncPushStatus() {
        if (!isPushSupported()) {
            console.warn('Push notifications not supported in this browser.');
            return;
        }

        // Safety timeout — odblokuje suwak, gdyby SW zawiódł
        const fallback = settingsToggle
            ? setTimeout(() => { settingsToggle.disabled = false; }, 3000)
            : null;

        try {
            const sub = await getWebPushSubscription();
            if (fallback) clearTimeout(fallback);

            if (settingsToggle) {
                settingsToggle.checked  = sub !== null;
                settingsToggle.disabled = false;
            }

            if (sub) {
                dismissPrompt();
            } else if (customModal) {
                checkAndShowModal();
            }
        } catch (err) {
            console.error('WebPush sync error:', err);
        }
    }

    // ── Modal powitalny (pojawia się po 5 s, max raz na 24 h) ────────────────

    function checkAndShowModal() {
        if (Notification.permission !== 'default') return;

        const dismissedAt = localStorage.getItem(DISMISSED_KEY);
        if (dismissedAt && (Date.now() - parseInt(dismissedAt)) < COOLDOWN_MS) return;

        setTimeout(() => {
            // iOS: niezainstalowane jako PWA — pokaż instrukcję
            if (window.navigator.standalone === false) {
                const p = customModal.querySelector('p');
                if (p) p.innerText = 'Aby włączyć powiadomienia, dodaj aplikację do ekranu głównego (Udostępnij → Dodaj do ekranu początkowego).';
                if (acceptBtn) acceptBtn.style.display = 'none';
            }
            customModal.style.display = 'flex';
        }, 5000);
    }

    // ── Wypisywanie z push (z synchronicznym wysłaniem do Django) ────────────

    async function unsubscribeUser() {
        try {
            const sub = await getWebPushSubscription();
            if (!sub) return true; // już nie ma subskrypcji

            if (hiddenOriginalBtn) {
                await fetch(hiddenOriginalBtn.dataset.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken(),
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        status_type: 'unsubscribe',
                        subscription: sub.toJSON(),
                        browser: (navigator.userAgent.match(/(firefox|chrome|safari)/i) || ['unknown'])[0].toLowerCase(),
                        user_agent: navigator.userAgent,
                    }),
                });
            }

            return sub.unsubscribe();
        } catch (err) {
            console.error('Unsubscribe error:', err);
            return false;
        }
    }

    // ── Obsługa suwaka w ustawieniach konta ──────────────────────────────────

    if (settingsToggle) {
        settingsToggle.addEventListener('change', async (e) => {
            const isTurningOn  = e.target.checked;
            const parentLabel  = settingsToggle.closest('.push-switch');

            settingsToggle.disabled = true;
            parentLabel?.classList.add('loading');

            // Żelazne zabezpieczenie — suwak zawsze wróci do responsywności
            const safety = setTimeout(() => {
                settingsToggle.disabled = false;
                parentLabel?.classList.remove('loading');
            }, 5000);

            try {
                if (isTurningOn) {
                    if (hiddenOriginalBtn) {
                        // SYNCHRONICZNE delegowanie kliknięcia (User Gesture dla Safari)
                        hiddenOriginalBtn.click();
                        dismissPrompt();
                        setTimeout(syncPushStatus, 2000);
                    } else {
                        settingsToggle.checked = false;
                    }
                } else {
                    const ok = await unsubscribeUser();
                    settingsToggle.checked = !ok;
                }
            } finally {
                clearTimeout(safety);
                settingsToggle.disabled = false;
                parentLabel?.classList.remove('loading');
            }
        });
    }

    // ── Obsługa modala ────────────────────────────────────────────────────────

    if (acceptBtn && hiddenOriginalBtn) {
        acceptBtn.addEventListener('click', () => {
            customModal.style.display = 'none';
            dismissPrompt();
            // SYNCHRONICZNE delegowanie kliknięcia (User Gesture dla Safari)
            hiddenOriginalBtn.click();
            setTimeout(syncPushStatus, 2000);
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            customModal.style.display = 'none';
            dismissPrompt();
        });
    }

    // ── Inicjalizacja: dwie próby (zaraz + po 1,5 s dla wolniejszych SW) ─────
    syncPushStatus();
    setTimeout(syncPushStatus, 1500);
});