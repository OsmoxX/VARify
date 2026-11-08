'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSocket, useSocketEvent, type MatchEventPayload } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';
import { isSoundEnabled, setSoundEnabled } from '@/lib/sound';

interface NotificationItem {
  id: string;
  icon: string;
  message: string;
  time: string;
  unread: boolean;
}

/** Nawigacja w stylu Django (`base.html` + `base.css`): logo, pigułka wyszukiwania, linki, dzwonek, menu konta. */
export function Navbar() {
  const router = useRouter();
  const { connected } = useSocket();
  const { user, tier, ready, logout } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sound, setSound] = useState(() => isSoundEnabled());
  const wrapperRef = useRef<HTMLElement>(null);
  const canSearch = hasAccess(tier, 'PLUS');
  const unread = items.filter((i) => i.unread).length;

  useSocketEvent<MatchEventPayload>('match_event', (e) => {
    setItems((prev) => {
      if (prev.some((p) => p.id === e.key)) return prev; // to samo zdarzenie z dwóch pokoi
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return [{ id: e.key, icon: e.icon || '⚽', message: `${e.title} — ${e.message}`, time, unread: true }, ...prev].slice(0, 30);
    });
  });

  // Kliknięcie poza panelami zamyka dzwonek i menu konta
  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(ev.target as Node)) {
        setBellOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const submitSearch = (ev: React.FormEvent) => {
    ev.preventDefault();
    const q = query.trim();
    if (q.length >= 2) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const toggleBell = () => {
    const open = !bellOpen;
    setBellOpen(open);
    setMenuOpen(false);
    if (open) setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  };

  const tierBadge =
    tier === 'PREMIUM' ? (
      <span className="user-tier-badge premium"><i className="fa-solid fa-crown" /> PREMIUM</span>
    ) : tier === 'PLUS' ? (
      <span className="user-tier-badge plus"><i className="fa-solid fa-star" /> PLUS</span>
    ) : (
      <span className="user-tier-badge free">FREE</span>
    );

  return (
    <nav className="navbar" ref={wrapperRef}>
      <Link href="/" className="nav-brand">
        <i className="fa-solid fa-futbol" /> <b style={{ fontWeight: 'inherit' }}>VAR<span>ify</span></b>
      </Link>

      {canSearch ? (
        <form className="nav-search-container" onSubmit={submitSearch}>
          <i className="fa-solid fa-magnifying-glass search-icon" />
          <input type="text" className="nav-search-input" placeholder="Szukaj drużyny (Enter)" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      ) : (
        <div className="nav-search-container nav-search-locked" title="Wymaga planu PLUS">
          <i className="fa-solid fa-lock search-icon" style={{ color: '#f59e0b' }} />
          <input type="text" className="nav-search-input" placeholder="Szukaj drużyny..." disabled />
          <div className="search-lock-tooltip">
            <i className="fa-solid fa-lock" />
            <span>Wyszukiwarka klubów wymaga planu <strong>PLUS</strong></span>
            <Link href="/subscribe" className="tooltip-upgrade-btn">Ulepsz teraz →</Link>
          </div>
        </div>
      )}

      <div className="nav-links">
        <Link href="/" className="nav-link"><i className="fa-solid fa-tower-broadcast" /> Mecze na żywo</Link>
        <Link href="/calendar" className="nav-link"><i className="fa-solid fa-calendar-days" /> Kalendarz</Link>
        <Link href="/ai" className="nav-link"><i className="fa-solid fa-wand-magic-sparkles" /> Analityk AI</Link>

        <span className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }} title={connected ? 'Połączono — wyniki na żywo' : 'Łączenie…'}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#10b981' : '#ef4444' }} />
        </span>
        <button
          className="notif-bell-btn"
          style={{ fontSize: '1.05rem' }}
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
          }}
          title={sound ? 'Dźwięk gola włączony' : 'Dźwięk gola wyłączony'}
          aria-label={sound ? 'Wyłącz dźwięk gola' : 'Włącz dźwięk gola'}
        >
          <i className={`fa-solid ${sound ? 'fa-volume-high' : 'fa-volume-xmark'}`} />
        </button>

        {/* PANEL POWIADOMIEŃ */}
        <div className="notif-wrapper">
          <button className="notif-bell-btn" onClick={toggleBell} title="Powiadomienia" aria-label="Powiadomienia">
            <i className="fa-solid fa-bell" />
            {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className={`notif-panel${bellOpen ? ' notif-panel-open' : ''}`}>
            <div className="notif-panel-header">
              <span>Powiadomienia</span>
              <button className="notif-clear-btn" onClick={() => setItems([])} title="Wyczyść wszystkie">
                <i className="fa-solid fa-trash-can" />
              </button>
            </div>
            <div className="notif-panel-body">
              {items.length === 0 ? (
                <div className="notif-empty">
                  <i className="fa-solid fa-bell-slash" />
                  <p>Brak powiadomień</p>
                </div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className={`notif-item${n.unread ? ' notif-unread' : ''}`}>
                    <span className="notif-icon">{n.icon}</span>
                    <div className="notif-content">
                      <div className="notif-text">{n.message}</div>
                      <div className="notif-time">{n.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* MENU KONTA */}
        {!ready ? (
          <span style={{ width: 38, height: 38 }} />
        ) : user ? (
          <div className="user-menu-wrapper">
            <button
              className="user-avatar-btn"
              title={user.username}
              aria-label="Menu użytkownika"
              onClick={() => {
                setMenuOpen(!menuOpen);
                setBellOpen(false);
              }}
            >
              <i className="fa-solid fa-circle-user" />
            </button>
            <div className={`user-dropdown${menuOpen ? ' user-dropdown-open' : ''}`}>
              <div className="user-dropdown-header">
                <i className="fa-solid fa-circle-user user-dropdown-icon" />
                <div className="user-dropdown-info">
                  <div className="user-dropdown-name">{user.username}</div>
                  <div className="user-dropdown-tier">{tierBadge}</div>
                </div>
              </div>
              <div className="user-dropdown-divider" />
              <Link href="/account" className="user-dropdown-item" onClick={() => setMenuOpen(false)}><i className="fa-solid fa-gear" /> Ustawienia konta</Link>
              <Link href="/favorites" className="user-dropdown-item" onClick={() => setMenuOpen(false)}><i className="fa-solid fa-star" /> Ulubione drużyny</Link>
              <Link href="/subscribe" className="user-dropdown-item" onClick={() => setMenuOpen(false)}><i className="fa-solid fa-gem" /> Plany i subskrypcja</Link>
              <div className="user-dropdown-divider" />
              <button
                className="user-dropdown-item user-dropdown-logout"
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                  router.push('/');
                }}
              >
                <i className="fa-solid fa-right-from-bracket" /> Wyloguj się
              </button>
            </div>
          </div>
        ) : (
          <Link href="/login" className="nav-link"><i className="fa-solid fa-right-to-bracket" /> Zaloguj</Link>
        )}
      </div>
    </nav>
  );
}
