/**
 * VARify — Custom PWA Install Prompt
 * Obsługuje: Android/Chrome (beforeinstallprompt) + iOS Safari (instrukcja manualna)
 */

(function () {
    'use strict';

    const DISMISSED_KEY   = 'pwa_install_dismissed_until';
    const DISMISS_DAYS    = 7;

    // ── 1. Nie pokazuj nic jeśli już zainstalowana (standalone) ─────────────
    const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    if (isStandalone) return;

    // ── 2. Nie pokazuj jeśli użytkownik zamknął w ciągu ostatnich 7 dni ─────
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) return;

    // ── 3. Detekcja iOS ──────────────────────────────────────────────────────
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIosSafari = isIos || (isIos && isSafari);

    // ── 4. Elementy DOM ──────────────────────────────────────────────────────
    const banner       = document.getElementById('pwa-install-banner');
    const installBtn   = document.getElementById('pwa-install-btn');
    const dismissBtn   = document.getElementById('pwa-install-dismiss');
    const iosModal     = document.getElementById('pwa-ios-modal');
    const iosModalClose = document.getElementById('pwa-ios-modal-close');

    if (!banner) return;

    let deferredPrompt = null;

    // ── 5. Android/Chrome: przechwycenie beforeinstallprompt ────────────────
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showBanner();
    });

    // ── 6. iOS Safari: pokaż baner z ręczną instrukcją ──────────────────────
    if (isIosSafari && !deferredPrompt) {
        // Małe opóźnienie, żeby strona zdążyła się załadować
        setTimeout(showBanner, 1500);
    }

    // ── 7. Kliknięcie przycisku instalacji ───────────────────────────────────
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                // Android/Chrome — natywny prompt
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                hideBanner();
                if (outcome === 'accepted') {
                    dismiss(); // zapisz, żeby nie pokazywać ponownie
                }
            } else if (isIosSafari) {
                // iOS — otwórz modal z instrukcją
                hideBanner();
                showIosModal();
            }
        });
    }

    // ── 8. Przycisk "X" — zamknij i zapamiętaj na 7 dni ────────────────────
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            hideBanner();
            dismiss();
        });
    }

    // ── 9. Zamknięcie modalu iOS ─────────────────────────────────────────────
    if (iosModalClose) {
        iosModalClose.addEventListener('click', hideIosModal);
    }
    if (iosModal) {
        iosModal.addEventListener('click', (e) => {
            if (e.target === iosModal) hideIosModal();
        });
    }

    // ── 10. Jeśli zainstalowano przez prompt, ukryj baner ───────────────────
    window.addEventListener('appinstalled', () => {
        hideBanner();
        dismiss();
    });

    // ──────────────────────────── HELPERS ────────────────────────────────────
    function showBanner() {
        if (!banner) return;
        banner.classList.add('pwa-banner-visible');
    }

    function hideBanner() {
        if (!banner) return;
        banner.classList.remove('pwa-banner-visible');
    }

    function showIosModal() {
        if (!iosModal) return;
        iosModal.classList.add('pwa-ios-modal-visible');
        document.body.style.overflow = 'hidden';
    }

    function hideIosModal() {
        if (!iosModal) return;
        iosModal.classList.remove('pwa-ios-modal-visible');
        document.body.style.overflow = '';
        dismiss();
    }

    function dismiss() {
        const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
        localStorage.setItem(DISMISSED_KEY, String(until));
    }
})();
