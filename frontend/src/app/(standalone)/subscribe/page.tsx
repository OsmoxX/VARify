'use client';

import '@/styles/subscribe.css';
import '@/styles/subscribe-modal.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type PlanKey = 'plus' | 'premium';

const FLOATING = [
  { delay: '0s', dur: '18s', x: '8%', size: '2rem' },
  { delay: '3s', dur: '22s', x: '80%', size: '1.4rem' },
  { delay: '7s', dur: '15s', x: '45%', size: '2.5rem' },
  { delay: '12s', dur: '20s', x: '65%', size: '1.2rem' },
];

export default function SubscribePage() {
  const { user, tier, ready, refresh } = useAuth();
  const payment = useSearchParams().get('payment');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; portal?: boolean } | null>(null);
  const [guestPlan, setGuestPlan] = useState<PlanKey | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState({ prev: false, next: true });

  // Po powrocie ze Stripe plan nadaje webhook asynchronicznie — krótko odpytujemy o nowy stan.
  useEffect(() => {
    if (payment !== 'success' || !user) return;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      void refresh();
      if (tries >= 8) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [payment, user, refresh]);

  // Karuzela (mobile): widoczność strzałek zależy od pozycji przewinięcia
  const updateNav = useCallback(() => {
    const el = cardsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setNav({ prev: el.scrollLeft > 10, next: Math.ceil(el.scrollLeft) < max - 10 });
  }, []);

  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateNav); // wywołuje się też zaraz po podpięciu
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateNav]);

  const scrollCards = (dir: 1 | -1) => {
    const el = cardsRef.current;
    const card = el?.querySelector<HTMLElement>('.sub-card');
    if (el && card) el.scrollBy({ left: dir * (card.offsetWidth + 20), behavior: 'smooth' });
  };

  useEffect(() => {
    if (!guestPlan) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGuestPlan(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [guestPlan]);

  const checkout = async (plan: PlanKey) => {
    if (!user) {
      setGuestPlan(plan);
      return;
    }
    setBusy(plan);
    setMessage(null);
    try {
      const res = await api.post<{ url: string }>(`/stripe/checkout/${plan}`, { locale: 'pl' });
      window.location.href = res.url;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Nie udało się rozpocząć płatności.', portal: err instanceof ApiError && err.status === 409 });
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy('portal');
    try {
      const res = await api.post<{ url: string }>('/stripe/portal');
      window.location.href = res.url;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Panel płatności jest niedostępny.' });
      setBusy(null);
    }
  };

  const current = (t: string) => ready && !!user && tier === t;
  const included = (t: 'FREE' | 'PLUS' | 'PREMIUM') => {
    const lvl = { FREE: 0, PLUS: 1, PREMIUM: 2 } as const;
    return ready && !!user && lvl[t] < lvl[tier];
  };

  return (
    <div className="vf-sub">
      <div className="pitch-bg" />
      <div className="ball ball-1" />
      <div className="ball ball-2" />
      <div className="ball ball-3" />
      <div className="ball ball-4" />

      {FLOATING.map((f, i) => (
        <div key={i} className="float-football" style={{ '--delay': f.delay, '--dur': f.dur, '--x': f.x, '--size': f.size } as React.CSSProperties} aria-hidden>
          ⚽
        </div>
      ))}

      <nav className="sub-nav">
        <Link href="/" className="sub-nav-brand">
          <div className="sub-nav-icon"><i className="fa-solid fa-futbol" /></div>
          <b style={{ fontWeight: 'inherit' }}>VAR<span>ify</span></b>
        </Link>
        <Link href="/" className="sub-nav-back">
          <i className="fa-solid fa-arrow-left" /> Wróć do aplikacji
        </Link>
      </nav>

      <main className="sub-main">
        <div className="sub-header">
          <div className="sub-badge"><i className="fa-solid fa-trophy" /> Odblokuj pełen potencjał</div>
          <h1>Wybierz swój plan</h1>
          <p className="sub-subtitle">Zdobądź pełny dostęp do statystyk i wyprzedź innych kibiców.</p>

          <div className="sub-messages">
            {payment === 'success' && (
              <div className="sub-alert" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#34d399' }}>
                <i className="fa-solid fa-circle-check" /> Płatność przyjęta — aktywujemy Twój plan{tier !== 'FREE' ? `: masz teraz ${tier}!` : '…'}
              </div>
            )}
            {payment === 'cancelled' && (
              <div className="sub-alert"><i className="fa-solid fa-circle-exclamation" /> Płatność anulowana — nic nie zostało pobrane.</div>
            )}
            {message && (
              <div className="sub-alert" role="alert" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                <i className="fa-solid fa-circle-exclamation" /> {message.text}
                {message.portal && (
                  <button type="button" onClick={() => void portal()} style={{ color: '#fbbf24', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>
                    Otwórz panel płatności
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="carousel-container">
          <button className="carousel-nav carousel-prev" aria-label="Poprzedni plan" style={{ display: nav.prev ? undefined : 'none' }} onClick={() => scrollCards(-1)}>
            <i className="fa-solid fa-chevron-left" />
          </button>

          <div className="sub-cards" ref={cardsRef} onScroll={updateNav}>
            {/* FREE */}
            <div className="sub-card sub-card-free" style={{ animationDelay: '0s' }}>
              <div className="sub-card-inner">
                <div className="plan-label">Free</div>
                <div className="plan-price"><span className="plan-amount">0 zł</span><span className="plan-period">/miesiąc</span></div>
                <ul className="feature-list">
                  <li className="ok"><i className="fa-solid fa-check" /> Mecze na żywo</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Nadchodzące spotkania</li>
                  <li className="locked"><i className="fa-solid fa-lock" /> Wyszukiwarka klubów</li>
                  <li className="locked"><i className="fa-solid fa-lock" /> Składy i historia spotkań</li>
                  <li className="locked"><i className="fa-solid fa-lock" /> Własny Nick w aplikacji</li>
                </ul>
                {current('FREE') ? (
                  <button className="plan-btn plan-btn-current" disabled><i className="fa-solid fa-circle-check" /> Twój obecny plan</button>
                ) : included('FREE') ? (
                  <button className="plan-btn plan-btn-current" disabled><i className="fa-solid fa-circle-check" /> Zawarty w Twoim planie</button>
                ) : (
                  <Link href="/" className="plan-btn plan-btn-free">Pozostań na Free</Link>
                )}
              </div>
            </div>

            {/* PLUS */}
            <div className="sub-card sub-card-plus" style={{ animationDelay: '0.12s' }}>
              <div className="popular-badge"><i className="fa-solid fa-star" /> Najczęściej wybierany</div>
              <div className="sub-card-inner">
                <div className="plan-label plan-label-plus">Plus</div>
                <div className="plan-price"><span className="plan-amount">9,99 zł</span><span className="plan-period">/miesiąc</span></div>
                <ul className="feature-list">
                  <li className="ok"><i className="fa-solid fa-check" /> Mecze na żywo i terminarz</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Wyszukiwarka klubów i zawodników</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Składy i historia spotkań</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Zmiana Nicku w aplikacji</li>
                  <li className="locked"><i className="fa-solid fa-lock" /> Zaawansowane statystyki graczy</li>
                </ul>
                {current('PLUS') ? (
                  <button className="plan-btn plan-btn-current" disabled><i className="fa-solid fa-circle-check" /> Twój obecny plan</button>
                ) : included('PLUS') ? (
                  <button className="plan-btn plan-btn-current" disabled><i className="fa-solid fa-circle-check" /> Zawarty w Twoim planie</button>
                ) : (
                  <button type="button" className="plan-btn plan-btn-plus" disabled={busy !== null} onClick={() => void checkout('plus')}>
                    <i className={busy === 'plus' ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-bolt'} /> Zacznij z PLUS
                  </button>
                )}
              </div>
            </div>

            {/* PREMIUM */}
            <div className="sub-card sub-card-premium" style={{ animationDelay: '0.24s' }}>
              <div className="premium-crown"><i className="fa-solid fa-crown" /></div>
              <div className="sub-card-inner">
                <div className="plan-label plan-label-premium">Premium</div>
                <div className="plan-price"><span className="plan-amount">19,99 zł</span><span className="plan-period">/miesiąc</span></div>
                <ul className="feature-list">
                  <li className="ok"><i className="fa-solid fa-check" /> Wszystko z pakietu PLUS</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Analityk AI</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Zaawansowane statystyki XG</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Brak reklam</li>
                  <li className="ok"><i className="fa-solid fa-check" /> Priorytetowe wsparcie</li>
                </ul>
                {current('PREMIUM') ? (
                  <button className="plan-btn plan-btn-current" disabled><i className="fa-solid fa-circle-check" /> Twój obecny plan</button>
                ) : (
                  <button type="button" className="plan-btn plan-btn-premium" disabled={busy !== null} onClick={() => void checkout('premium')}>
                    <i className={busy === 'premium' ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-crown'} /> Wybierz Premium
                  </button>
                )}
              </div>
            </div>
          </div>

          <button className="carousel-nav carousel-next" aria-label="Następny plan" style={{ display: nav.next ? undefined : 'none' }} onClick={() => scrollCards(1)}>
            <i className="fa-solid fa-chevron-right" />
          </button>
        </div>

        <p className="sub-footer-note">
          <i className="fa-solid fa-shield-halved" />
          Bezpieczna płatność przez Stripe · Anuluj w dowolnym momencie · Brak ukrytych opłat
        </p>
        {ready && user && tier !== 'FREE' && (
          <p className="sub-footer-note" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={() => void portal()} disabled={busy !== null} style={{ color: '#64748b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
              Zarządzaj subskrypcją / anuluj
            </button>
          </p>
        )}
      </main>

      {/* Modal dla gościa — jak w Django */}
      <div className={`guest-auth-overlay${guestPlan ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="guest-auth-title" onClick={(e) => e.target === e.currentTarget && setGuestPlan(null)}>
        <div className="guest-auth-box">
          <button className="guest-auth-close" aria-label="Zamknij" onClick={() => setGuestPlan(null)}>
            <i className="fa-solid fa-xmark" />
          </button>
          <div className="guest-auth-icon">🔐</div>
          <h2 id="guest-auth-title">Konto wymagane do zakupu</h2>
          <p>Aby aktywować plan {guestPlan === 'plus' ? 'Plus' : 'Premium'} i otrzymywać powiadomienia Push, załóż darmowe konto w&nbsp;<strong>10 sekund</strong>!</p>
          <div className="guest-auth-actions">
            <Link href={`/register?next=/subscribe`} className="ga-btn-primary"><i className="fa-solid fa-user-plus" /> Utwórz darmowe konto</Link>
            <div className="guest-auth-divider">lub</div>
            <Link href={`/login?next=/subscribe`} className="ga-btn-outline"><i className="fa-solid fa-right-to-bracket" /> Zaloguj się</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
