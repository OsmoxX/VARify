'use client';

import '@/styles/login.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { BouncingBall, Particles, useCardTilt } from '@/components/auth/Backdrop';

/** Dozwolone tylko ścieżki wewnętrzne (ochrona przed open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  useCardTilt(tiltRef);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zalogować.');
      setBusy(false);
    }
  };

  return (
    <div className="vf-login">
      <div className="pitch-bg" />
      <div className="ball" />
      <div className="ball" />
      <div className="ball" />
      <BouncingBall />
      <Particles />

      <div ref={tiltRef} style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420 }}>
        <div className="card">
          <div className="logo">
            <div className="logo-icon">⚽</div>
            <h1>VARify</h1>
            <p>Sign in to track your matches live</p>
          </div>

          {error && (
            <div className="messages" role="alert">
              <div className="message error">
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444', marginRight: 6 }} />
                {error}
              </div>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="id_email">Adres e-mail</label>
              <div className="input-wrap">
                <input
                  type="text"
                  inputMode="email"
                  id="id_email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="twoj@email.pl"
                  autoComplete="username"
                />
                <i className="fa-solid fa-envelope" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="id_password">Hasło</label>
              <div className="input-wrap">
                <input
                  type="password"
                  id="id_password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <i className="fa-solid fa-lock" />
              </div>
            </div>

            <button type="submit" className="btn-submit" disabled={busy}>
              <i className={busy ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-right-to-bracket'} /> Zaloguj się
            </button>
          </form>

          <div className="divider">lub</div>

          <div className="footer-link">
            Nie masz konta? <Link href={`/register?next=${encodeURIComponent(next)}`}>Utwórz je teraz →</Link>
          </div>

          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                color: '#64748b',
                fontSize: '0.85rem',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8,
                padding: '10px 20px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <i className="fa-solid fa-eye" />
              Przeglądaj bez logowania
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
