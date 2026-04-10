/**
 * ai_chat.js — VARify AI Analyst   |   Floating Chat Widget
 * Vanilla JS, brak zależności zewnętrznych.
 *
 * Obsługuje:
 *   - Otwieranie / zamykanie panelu (FAB, overlay, przycisk X, klawisz ESC)
 *   - Wysyłanie zapytań do /api/ai-chat/ z pełną historią konwersacji
 *   - Wskaźnik ładowania (typing dots), auto-scroll i autoresize textarea
 *   - AbortController → przycisk "Stop Generation" (kwadrat) podczas oczekiwania
 *   - Przycisk "Wyczyść historię" (kosz) → czyści DOM + sessionStorage + generuje nowy UUID sesji
 */

(function () {
    'use strict';

    // ── HISTORIA KONWERSACJI (persystentna przez sessionStorage) ───────
    const STORAGE_KEY       = 'varify_ai_history';
    const SESSION_ID_KEY    = 'varify_ai_session_id';   // UUID sesji agenta
    const MAX_HISTORY_TURNS = 40;

    /** Losowy UUID v4 (nie wymaga crypto.randomUUID — kompatybilność z Safari) */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /** Zwraca bieżące ID sesji z localStorage lub tworzy nowe. */
    function getSessionId() {
        let id = localStorage.getItem(SESSION_ID_KEY);
        if (!id) {
            id = generateUUID();
            localStorage.setItem(SESSION_ID_KEY, id);
        }
        return id;
    }

    /** Generuje nowe ID sesji (reset pamięci agenta). */
    function resetSessionId() {
        const newId = generateUUID();
        localStorage.setItem(SESSION_ID_KEY, newId);
        return newId;
    }

    /** Wczytuje historię z sessionStorage. Zwraca [] jeśli brak lub błąd parsowania. */
    function loadHistory() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    /** Zapisuje bieżącą historię do sessionStorage. */
    function saveHistory() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messageHistory));
        } catch {
            // sessionStorage może być pełny (private mode) — ignorujemy cicho
        }
    }

    let messageHistory = loadHistory();

    // ── AbortController — bieżące żądanie ──────────────────────────
    let currentAbortController = null;

    // ── REFERENCJE DOM ─────────────────────────────────────────────
    const fab             = document.getElementById('ai-chat-fab');
    const panel           = document.getElementById('ai-chat-panel');
    const overlay         = document.getElementById('ai-chat-overlay');
    const closeBtn        = document.getElementById('ai-chat-close-btn');
    const clearBtn        = document.getElementById('ai-chat-clear-btn');
    const messagesEl      = document.getElementById('ai-chat-messages');
    const typingIndicator = document.getElementById('ai-typing-indicator');
    const input           = document.getElementById('ai-chat-input');
    const sendBtn         = document.getElementById('ai-chat-send-btn');
    const stopBtn         = document.getElementById('ai-chat-stop-btn');

    if (!fab || !panel) return;

    // ── OTWIERANIE / ZAMYKANIE ─────────────────────────────────────
    function openPanel() {
        panel.classList.add('open');
        overlay.classList.add('visible');
        fab.classList.add('hidden');
        document.body.style.overflow = 'hidden';
        if (input) setTimeout(() => input.focus(), 350);
    }

    function closePanel() {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
        fab.classList.remove('hidden');
        document.body.style.overflow = '';
    }

    fab.addEventListener('click', openPanel);
    if (closeBtn)  closeBtn.addEventListener('click', closePanel);
    if (overlay)   overlay.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });

    // ── CSRF TOKEN ─────────────────────────────────────────────────
    function getCsrfToken() {
        const name = 'csrftoken';
        for (let cookie of document.cookie.split(';')) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) return decodeURIComponent(value);
        }
        const hiddenInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return hiddenInput ? hiddenInput.value : '';
    }

    // ── AUTO-SCROLL ────────────────────────────────────────────────
    function scrollToBottom() {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ── ESCAPE HTML (XSS protection) ──────────────────────────────
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── FORMATOWANIE TEKSTU AI ─────────────────────────────────────
    function formatAiText(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    // ── DODAWANIE WIADOMOŚCI ───────────────────────────────────────
    function appendMessage(role, text) {
        if (!messagesEl) return;

        const wrapper = document.createElement('div');

        if (role === 'user') {
            wrapper.className = 'chat-message user-message';
            wrapper.innerHTML = `
                <div class="chat-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="chat-bubble">${escapeHtml(text)}</div>
            `;
        } else if (role === 'ai') {
            wrapper.className = 'chat-message ai-message';
            wrapper.innerHTML = `
                <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="chat-bubble">${formatAiText(text)}</div>
            `;
        } else {
            wrapper.className = 'chat-message ai-message error-message';
            wrapper.innerHTML = `
                <div class="chat-avatar"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="chat-bubble">
                    <i class="fa-solid fa-circle-exclamation" style="margin-right:0.35rem;"></i>
                    ${escapeHtml(text)}
                </div>
            `;
        }

        if (typingIndicator && messagesEl.contains(typingIndicator)) {
            messagesEl.insertBefore(wrapper, typingIndicator);
        } else {
            messagesEl.appendChild(wrapper);
        }

        scrollToBottom();
    }

    // ── TYPING INDICATOR ──────────────────────────────────────────
    function showTyping() {
        if (typingIndicator) {
            typingIndicator.classList.add('visible');
            scrollToBottom();
        }
    }

    function hideTyping() {
        if (typingIndicator) typingIndicator.classList.remove('visible');
    }

    // ── STAN ŁADOWANIA ─────────────────────────────────────────────
    function setLoading(isLoading) {
        if (!input || !sendBtn) return;
        input.disabled = isLoading;
        sendBtn.disabled = isLoading;
        sendBtn.style.display = isLoading ? 'none' : '';

        if (stopBtn) {
            stopBtn.style.display = isLoading ? '' : 'none';
        }

        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }

    // ── WYCZYŚĆ HISTORIĘ ───────────────────────────────────────────
    function clearHistory() {
        // 1. Abort ongoing request if any
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }

        // 2. Reset in-memory history
        messageHistory = [];

        // 3. Clear sessionStorage
        try { sessionStorage.removeItem(STORAGE_KEY); } catch {}

        // 4. Generate new session UUID → LangGraph agent gets a fresh state
        const newSessionId = resetSessionId();
        console.log('[VARify AI] Nowa sesja agenta:', newSessionId);

        // 5. Clear DOM messages (keep welcome message and typing indicator)
        if (messagesEl) {
            const toRemove = messagesEl.querySelectorAll('.chat-message');
            toRemove.forEach(el => el.remove());
        }

        // 6. Hide typing indicator + reset loading state
        hideTyping();
        setLoading(false);

        // 7. Show confirmation message in chat
        appendMessage('ai', '🧹 Historia czatu została wyczyszczona. Zaczynamy od nowa!');
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearHistory);
    }

    // ── STOP GENERATION ───────────────────────────────────────────
    if (stopBtn) {
        stopBtn.addEventListener('click', function () {
            if (currentAbortController) {
                currentAbortController.abort();
            }
        });
    }

    // ── WYSYŁANIE WIADOMOŚCI ───────────────────────────────────────
    async function sendMessage() {
        if (!input || !sendBtn) return;

        const query = input.value.trim();
        if (!query) return;

        // Abort any ongoing request
        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();

        messageHistory.push({ role: 'user', content: query });
        if (messageHistory.length > MAX_HISTORY_TURNS) {
            messageHistory = messageHistory.slice(-MAX_HISTORY_TURNS);
        }
        saveHistory();

        appendMessage('user', query);
        input.value = '';
        input.style.height = '44px';

        setLoading(true);
        showTyping();

        try {
            const apiUrl = document.getElementById('ai-chat-panel').dataset.apiUrl;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    history: messageHistory,
                    session_id: getSessionId(),   // przekazujemy UUID agenta
                }),
                signal: currentAbortController.signal,
            });

            const data = await response.json();
            hideTyping();

            if (!response.ok) {
                messageHistory.pop();
                if (response.status === 403) {
                    appendMessage('error', 'Dostęp tylko dla użytkowników Premium. Odblokuj pełny plan, aby korzystać z AI Analityka!');
                } else if (response.status === 401) {
                    appendMessage('error', 'Musisz być zalogowany, aby korzystać z AI Analityka.');
                } else {
                    appendMessage('error', data.error || 'Wystąpił błąd serwera. Spróbuj ponownie.');
                }
            } else if (data.error) {
                messageHistory.pop();
                appendMessage('error', data.error);
            } else {
                const aiText = data.response || 'Brak odpowiedzi od AI.';
                messageHistory.push({ role: 'assistant', content: aiText });
                saveHistory();
                appendMessage('ai', aiText);
            }

        } catch (err) {
            hideTyping();

            if (err.name === 'AbortError') {
                // Przerwane przez użytkownika — cofnij ostatnią wiadomość i pokaż info
                messageHistory.pop();
                appendMessage('ai', '⏹ Przerwano generowanie.');
            } else {
                messageHistory.pop();
                appendMessage('error', 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.');
                console.error('[VARify AI] Błąd fetch:', err);
            }
        } finally {
            currentAbortController = null;
            setLoading(false);
            if (input) input.focus();
        }
    }

    // ── EVENT LISTENERS (wysyłanie) ────────────────────────────────
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        input.addEventListener('input', function () {
            this.style.height = '44px';
            const newH = Math.min(this.scrollHeight, 120);
            this.style.height = newH + 'px';
        });
    }

    // ── INICJALIZACJA — przywrócenie historii po przeładowaniu strony ──
    function restoreMessagesFromHistory() {
        if (messageHistory.length === 0) return;
        for (const msg of messageHistory) {
            if (msg.role === 'user')      appendMessage('user', msg.content);
            else if (msg.role === 'assistant') appendMessage('ai', msg.content);
        }
    }

    restoreMessagesFromHistory();
    scrollToBottom();

})();
