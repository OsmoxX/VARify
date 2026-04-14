document.addEventListener('DOMContentLoaded', () => {

    const hiddenOriginalBtn = document.getElementById('webpush-subscribe-button');
    const customModal = document.getElementById('push-custom-modal');
    const acceptBtn = document.getElementById('push-accept-btn');
    const laterBtn = document.getElementById('push-later-btn');
    const settingsToggle = document.getElementById('push-settings-toggle');

    // 1. Zatrzymanie Pętli Modala - Pokaż 5s po załadowaniu tylko RAZ
    if (customModal) {
        setTimeout(() => {
            // Sprawdzamy czy wspiera technologię
            if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

            // Pokaż wyłącznie wtedy, gdy nigdy wcześniej nie pytano (ustawienie domyślne)
            if (Notification.permission === 'default') {
                const dismissedAt = localStorage.getItem('push_prompt_dismissed');
                const now = Date.now();
                const hours24 = 24 * 60 * 60 * 1000;

                // Sprawdź czy brak wpisu w localStorage lub minęły 24h
                if (!dismissedAt || (now - parseInt(dismissedAt)) > hours24) {
                    
                    // Bezpieczna weryfikacja obsługi na starym iOS
                    if (window.navigator.standalone !== undefined && !window.navigator.standalone) {
                        const pElement = customModal.querySelector('p');
                        if (pElement) {
                            pElement.innerText = "Aby włączyć powiadomienia, dodaj aplikację do ekranu głównego (Opcja: Dodaj do ekranu pocz. -> wejdź w apkę).";
                        }
                        if (acceptBtn) acceptBtn.style.display = 'none';
                    }

                    // Pokaż modal do interakcji
                    customModal.style.display = 'flex';
                }
            }
        }, 5000);
    }

    // 2. Obsługa potwierdzenia modala (Prośba o zgodę -> Subskrypcja API z django)
    if (acceptBtn && hiddenOriginalBtn) {
        acceptBtn.addEventListener('click', async () => {
            // Wyłączenie modala na stałe na to okno przeglądarki (localStorage)
            customModal.style.display = 'none';
            localStorage.setItem('push_prompt_dismissed', Date.now().toString());

            try {
                // Wywołaj natywne żądanie przeglądarki
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    // Natychmiast kliknij przycisk z biblioteki django, aby zarejestrować endpoint w obiekcie PushManager i posłać FETCHa do bazy!
                    hiddenOriginalBtn.click();
                    
                    // Zaktualizuj suwak w ustawieniach jeśli przypadkiem jest widoczny
                    if (settingsToggle) {
                        settingsToggle.checked = true;
                    }
                }
            } catch(e) {
                console.error("WebPush permission request error: ", e);
            }
        });
    }

    // Obsługa zamknięcia modala tymczasowo
    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            customModal.style.display = 'none';
            localStorage.setItem('push_prompt_dismissed', Date.now().toString());
        });
    }

    // 3. Inicjalizacja przycisku Ustawień na obiektywnych i prawdziwych danych (z API przeglądarki)
    async function initSettingsToggle() {
        if (!settingsToggle) return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        
        try {
            // Czekamy na załadowanie (Service Worker musi działać w tle)
            const reg = await navigator.serviceWorker.ready;
            if (reg) {
                const sub = await reg.pushManager.getSubscription(); // fetch the real un-cached browser state
                settingsToggle.checked = !!sub;
                settingsToggle.disabled = false;
            }
        } catch (e) {
            console.error("WebPush toggle init error:", e);
        }
    }

    initSettingsToggle();

    // 4. Obsługa zmiany Toggle poprzez logikę backendową "ukrytego" przycisku
    if (settingsToggle && hiddenOriginalBtn) {
        settingsToggle.addEventListener('change', async (e) => {
            e.preventDefault();
            const turningOn = e.target.checked;
            
            // Wizualne zamrożenie -> wycofujemy toggle aż do skutku!
            settingsToggle.checked = !turningOn;
            settingsToggle.closest('.push-switch').classList.add('loading');
            settingsToggle.disabled = true;

            try {
                if (!turningOn) {
                    // Gasimy powiadomienia -> ukryty klik anuluje wg logiki z django-webpush
                    hiddenOriginalBtn.click();
                    settingsToggle.checked = false;
                } else {
                    // Włączanmy powiadomienia - żądamy okienka lub z góry potwierdzamy
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        hiddenOriginalBtn.click();
                        settingsToggle.checked = true;
                    } else {
                        // User zablokował powiadomienia
                        settingsToggle.checked = false;
                    }
                }
            } catch (err) {
                console.error("Error setting push state", err);
                settingsToggle.checked = !turningOn; 
            }

            // Przywracamy toggle
            settingsToggle.disabled = false;
            settingsToggle.closest('.push-switch').classList.remove('loading');
        });
    }
});
