'use client';

import '@/styles/ai.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';

interface Msg {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

const STORAGE_KEY = 'varify_ai_history';
const MAX_TURNS = 40;
export const OPEN_AI_EVENT = 'varify:open-ai';

function loadHistory(): Msg[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Msg[]).filter((m) => m && (m.role === 'user' || m.role === 'assistant')) : [];
  } catch {
    return [];
  }
}
function saveHistory(list: Msg[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((m) => m.role !== 'error').slice(-MAX_TURNS)));
  } catch {
    /* tryb prywatny / pełny storage */
  }
}

/** **pogrubienie** i nowe linie — bez dangerouslySetInnerHTML (brak XSS). */
function AiText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*.+?\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
          )}
        </span>
      ))}
    </>
  );
}

/** Pływający widget AI Analityka — port `ai_chat.js` + markup z `base.html`. */
export function AiChatWidget() {
  const { tier, user, ready } = useAuth();
  const premium = ready && !!user && hasAccess(tier, 'PREMIUM');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openPanel = useCallback(() => {
    setOpen(true);
    if (!loaded) {
      setMessages(loadHistory());
      setLoaded(true);
    }
    setTimeout(() => inputRef.current?.focus(), 350);
  }, [loaded]);

  useEffect(() => {
    const onOpen = () => openPanel();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener(OPEN_AI_EVENT, onOpen);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_AI_EVENT, onOpen);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPanel]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const base = messages.filter((m) => m.role !== 'error');
    const history = [...base, { role: 'user' as const, content: text }].slice(-MAX_TURNS);
    setMessages([...base, { role: 'user', content: text }]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '44px';
    setLoading(true);
    try {
      const res = await api.post<{ response: string }>('/ai/chat', { history }, { signal: ctrl.signal });
      const next: Msg[] = [...history, { role: 'assistant', content: res.response || 'Brak odpowiedzi od AI.' }];
      setMessages(next);
      saveHistory(next);
    } catch (err) {
      if (ctrl.signal.aborted) {
        setMessages([...base, { role: 'assistant', content: '⏹ Przerwano generowanie.' }]);
      } else {
        const msg =
          err instanceof ApiError
            ? err.status === 403
              ? 'Dostęp tylko dla użytkowników Premium. Odblokuj pełny plan, aby korzystać z AI Analityka!'
              : err.status === 401
                ? 'Musisz być zalogowany, aby korzystać z AI Analityka.'
                : err.message
            : 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
        setMessages([...base, { role: 'error', content: msg }]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignoruj */
    }
    setLoading(false);
    setMessages([{ role: 'assistant', content: '🧹 Historia czatu została wyczyszczona. Zaczynamy od nowa!' }]);
  };

  return (
    <div className="vf-ai">
      <button id="ai-chat-fab" className={open ? 'hidden' : ''} title="VARify AI Analyst" aria-label="Otwórz AI Analityka" aria-expanded={open} onClick={openPanel}>
        <i className="fa-solid fa-robot" />
      </button>
      <div id="ai-chat-overlay" className={open ? 'visible' : ''} onClick={() => setOpen(false)} />
      <div id="ai-chat-panel" className={open ? 'open' : ''} role="dialog" aria-label="VARify AI Analyst">
        <div className="ai-chat-header">
          <div className="ai-chat-header-icon"><i className="fa-solid fa-robot" /></div>
          <div className="ai-chat-header-text">
            <h4>VARify AI Analyst</h4>
            {premium ? (
              <span><span className="ai-status-dot" /> Gotowy do analizy</span>
            ) : (
              <span style={{ color: '#64748b' }}><i className="fa-solid fa-lock" style={{ fontSize: '0.65rem' }} /> Wymaga planu Premium</span>
            )}
          </div>
          <div className="ai-premium-badge"><i className="fa-solid fa-crown" /> Premium</div>
          <button id="ai-chat-close-btn" title="Zamknij" aria-label="Zamknij panel AI" onClick={() => setOpen(false)}><i className="fa-solid fa-xmark" /></button>
          {premium && (
            <button id="ai-chat-clear-btn" title="Wyczyść historię czatu" aria-label="Wyczyść historię czatu" onClick={clear}><i className="fa-solid fa-trash-can" /></button>
          )}
        </div>

        {premium ? (
          <>
            <div className="ai-chat-messages" id="ai-chat-messages" role="log" aria-live="polite" ref={listRef}>
              <div className="chat-welcome">
                <i className="fa-solid fa-robot" />
                <p>Cześć! Jestem Twoim AI Analitykiem sportowym.<br />Zapytaj mnie o dowolny mecz, statystyki lub drużyny.</p>
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role === 'user' ? 'user-message' : `ai-message${m.role === 'error' ? ' error-message' : ''}`}`}>
                  <div className="chat-avatar"><i className={`fa-solid ${m.role === 'user' ? 'fa-user' : m.role === 'error' ? 'fa-triangle-exclamation' : 'fa-robot'}`} /></div>
                  <div className="chat-bubble">
                    {m.role === 'assistant' ? <AiText text={m.content} /> : m.role === 'error' ? <><i className="fa-solid fa-circle-exclamation" style={{ marginRight: '0.35rem' }} />{m.content}</> : m.content}
                  </div>
                </div>
              ))}
              <div className={`typing-indicator${loading ? ' visible' : ''}`} id="ai-typing-indicator" aria-label="AI pisze...">
                <div className="ai-typing-avatar"><i className="fa-solid fa-robot" /></div>
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
            <div className="ai-chat-input-area">
              <textarea
                id="ai-chat-input"
                ref={inputRef}
                rows={1}
                maxLength={500}
                autoComplete="off"
                value={input}
                disabled={loading}
                placeholder="Zapytaj o mecz, drużynę, statystyki..."
                aria-label="Wiadomość do AI Analityka"
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = '44px';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {loading && (
                <button id="ai-chat-stop-btn" title="Zatrzymaj generowanie" aria-label="Zatrzymaj generowanie" onClick={() => abortRef.current?.abort()}><i className="fa-solid fa-square" /></button>
              )}
              {!loading && (
                <button id="ai-chat-send-btn" title="Wyślij (Enter)" aria-label="Wyślij wiadomość" disabled={!input.trim()} onClick={() => void send()}><i className="fa-solid fa-paper-plane" /></button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="ai-chat-paywall-panel">
              <div className="ai-chat-paywall-preview" aria-hidden="true">
                {['', 'right short', '', 'right long', 'short'].map((c, i) => (
                  <div key={i} className={`paywall-fake-msg${c.includes('right') ? ' right' : ''}`}>
                    <div className="paywall-fake-avatar" />
                    <div className={`paywall-fake-bubble ${c.includes('long') || i === 0 ? 'long' : c.includes('short') ? 'short' : ''}`} />
                  </div>
                ))}
              </div>
              <div className="ai-chat-paywall-overlay">
                <div className="ai-paywall-box">
                  <div className="ai-paywall-crown"><i className="fa-solid fa-crown" /></div>
                  <h4>AI Analityk Sportowy</h4>
                  <p>
                    Zadawaj pytania o mecze, drużyny i statystyki swojemu personalnemu asystentowi AI. Dostępne wyłącznie w planie <strong style={{ color: '#f59e0b' }}>Premium</strong>.
                  </p>
                  <Link href={user ? '/subscribe' : '/login'} className="ai-paywall-upgrade-btn" onClick={() => setOpen(false)}>
                    <i className="fa-solid fa-crown" /> {user ? 'Odblokuj AI Analityka' : 'Zaloguj się'}
                  </Link>
                </div>
              </div>
            </div>
            <div className="ai-chat-input-area locked">
              <textarea id="ai-chat-input" rows={1} disabled placeholder="Dostępne tylko dla Premium..." aria-label="Input zablokowany — wymagane Premium" />
              <button id="ai-chat-send-btn" disabled aria-label="Wyślij wiadomość"><i className="fa-solid fa-paper-plane" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
