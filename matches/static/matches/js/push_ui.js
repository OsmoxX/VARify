document.addEventListener('DOMContentLoaded', () => {
    const hiddenOriginalBtn = document.getElementById('webpush-subscribe-button');
    const customModal = document.getElementById('push-custom-modal');
    const acceptBtn = document.getElementById('push-accept-btn');
    const laterBtn = document.getElementById('push-later-btn');
    const settingsToggle = document.getElementById('push-settings-toggle');

    function dismissPrompt() {
        localStorage.setItem('push_prompt_dismissed', Date.now().toString());
    }

    // ==========================================
    // 1. Synchronizacja na /webpush/
    // ==========================================
    async function syncPushStatus() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn("Powiadomienia Push nie są wspierane przez tę przeglądarkę.");
            return;
        }
        
        // Safety Timeout - uwalnia suwak, gdyby worker od biblioteki zawiódł
        const fallbackTimeout = setTimeout(() => {
            if (settingsToggle) settingsToggle.disabled = false;
        }, 3000);

        try {
            console.log("Checking subscription for /webpush/...");
            
            // Pobieramy wyłącznie ten rejestr, który instaluje natywnie django-webpush
            const reg = await navigator.serviceWorker.getRegistration('/webpush/');
            if (!reg) {
                console.warn("Service Worker dla '/webpush/' nie jest jeszcze zarejestrowany.");
                return;
            }

            const sub = await reg.pushManager.getSubscription();
            clearTimeout(fallbackTimeout);

            if (sub !== null) {
                console.log("Subscription found!");
            } else {
                console.log("Subscription NOT found - setting toggle to false.");
            }

            // Ustawiamy suwak na podstawie fizycznej subskrypcji
            if (settingsToggle) {
                const isSubscribed = sub !== null;
                settingsToggle.checked = isSubscribed;
                settingsToggle.disabled = false;
            }

            if (sub) {
                dismissPrompt();
            } else if (customModal) {
                checkAndShowModal();
            }
        } catch (e) {
            console.error("Błąd synchronizacji WebPush:", e);
        }
    }

    function checkAndShowModal() {
        if (Notification.permission === 'default') {
            const dismissedAt = localStorage.getItem('push_prompt_dismissed');
            const now = Date.now();
            const hours24 = 24 * 60 * 60 * 1000;

            if (!dismissedAt || (now - parseInt(dismissedAt)) > hours24) {
                setTimeout(() => {
                    // Sprawdzenie iOS PWA
                    if (window.navigator.standalone === false) {
                        const pElement = customModal.querySelector('p');
                        if (pElement) {
                            pElement.innerText = "Aby włączyć powiadomienia, dodaj aplikację do ekranu głównego (Opcja: Udostępnij -> Dodaj do ekranu początkowego).";
                        }
                        if (acceptBtn) acceptBtn.style.display = 'none';
                    }
                    customModal.style.display = 'flex';
                }, 4000);
            }
        }
    }

    // Odpalamy sync od razu (polegamy na auto-rejestrze biblioteki)
    syncPushStatus();
    setTimeout(syncPushStatus, 1500);

    // ==========================================
    // 3. Naprawiony Unsubscribe
    // ==========================================
    async function unsubscribeUser() {
        try {
            const reg = await navigator.serviceWorker.getRegistration('/webpush/');
            if (!reg) return false;

            const subscription = await reg.pushManager.getSubscription();
            if (!subscription) return true;

            // Wyślij info do Django
            if (hiddenOriginalBtn) {
                const url = hiddenOriginalBtn.dataset.url;
                const payload = {
                    status_type: 'unsubscribe',
                    subscription: subscription.toJSON(),
                    browser: (navigator.userAgent.match(/(firefox|chrome|safari)/ig) || ['unknown'])[0].toLowerCase(),
                    user_agent: navigator.userAgent
                };

                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify(payload),
                    credentials: 'include'
                });
            }

            return await subscription.unsubscribe();
        } catch(err) {
            console.error("Błąd podczas wypisywania:", err);
            return false;
        }
    }

    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    }

    // ==========================================
    // 2. Obsługa przełącznika i Zdanie Się na Bibliotekę
    // ==========================================
    if (settingsToggle) {
        settingsToggle.addEventListener('change', async (e) => {
            const isTurningOn = e.target.checked;
            
            settingsToggle.disabled = true;
            const parentLabel = settingsToggle.closest('.push-switch');
            if (parentLabel) parentLabel.classList.add('loading');

            if (isTurningOn) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted' && hiddenOriginalBtn) {
                    // Całkowite poleganie na bibliotece webpush
                    hiddenOriginalBtn.click();
                    dismissPrompt();
                    
                    // Czekamy chwilę na proces biblioteki i syncujemy
                    setTimeout(syncPushStatus, 2000);
                } else {
                    settingsToggle.checked = false;
                }
            } else {
                const success = await unsubscribeUser();
                settingsToggle.checked = !success;
            }

            settingsToggle.disabled = false;
            if (parentLabel) parentLabel.classList.remove('loading');
        });
    }

    // Modal Events
    if (acceptBtn && hiddenOriginalBtn) {
        acceptBtn.addEventListener('click', async () => {
            customModal.style.display = 'none';
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                hiddenOriginalBtn.click();
                dismissPrompt();
                setTimeout(syncPushStatus, 2000);
            }
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            customModal.style.display = 'none';
            dismissPrompt();
        });
    }
});