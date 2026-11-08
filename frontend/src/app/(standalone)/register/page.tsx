'use client';

import '@/styles/register.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { BouncingBall, Particles, useCardTilt } from '@/components/auth/Backdrop';

/** Miernik siły hasła — port `register.js`. */
function strength(pw: string): { pct: string; color: string; text: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { pct: '0%', color: 'transparent', text: 'Password strength' },
    { pct: '25%', color: '#ef4444', text: '⚠ Weak' },
    { pct: '50%', color: '#f59e0b', text: '● Fair' },
    { pct: '75%', color: '#3b82f6', text: '✓ Good' },
    { pct: '100%', color: '#10b981', text: '✓✓ Strong' },
  ];
  return levels[score] ?? levels[0]!;
}

export default function RegisterPage() {
  const { register, user, ready } = useAuth();
  const router = useRouter();
  const raw = useSearchParams().get('next');
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  useCardTilt(tiltRef);
  const s = strength(password);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
      setBusy(false);
    }
  };

  return (
    <div className="vf-register">
      <div className="pitch-bg" />
      <div className="orb" />
      <div className="orb" />
      <div className="orb" />
      <BouncingBall />
      <Particles />

      <div ref={tiltRef} className="tilt" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440 }}>
        <div className="card">
          <div className="logo">
            <div className="logo-icon">🏟️</div>
            <h1>Create Account</h1>
            <p>Join VARify and follow every match live</p>
          </div>

          <div className="steps">
            <div className="step-dot active" />
            <div className="step-dot" />
            <div className="step-dot" />
          </div>

          {error && (
            <div className="messages" role="alert">
              <div className="message error">❌ {error}</div>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="id_username">Username</label>
              <div className="input-wrap">
                <input type="text" id="id_username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. football_fan99" autoComplete="username" maxLength={30} />
                <i className="fa-solid fa-at" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="id_email">Email Address</label>
              <div className="input-wrap">
                <input type="email" id="id_email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                <i className="fa-solid fa-envelope" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="id_password1">Password</label>
              <div className="input-wrap">
                <input type={show1 ? 'text' : 'password'} id="id_password1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" maxLength={72} />
                <i className="fa-solid fa-lock" />
                <button type="button" className="eye-btn" onClick={() => setShow1(!show1)} aria-label={show1 ? 'Hide password' : 'Show password'}>
                  <i className={`fa-solid ${show1 ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
              <div className="strength-bar">
                <div className="strength-fill" style={{ width: s.pct, background: s.color }} />
              </div>
              <div className="strength-label" style={{ color: s.color === 'transparent' ? '#6b7280' : s.color }}>{s.text}</div>
            </div>

            <div className="form-group">
              <label htmlFor="id_password2">Confirm Password</label>
              <div className="input-wrap">
                <input type={show2 ? 'text' : 'password'} id="id_password2" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" maxLength={72} />
                <i className="fa-solid fa-shield-halved" />
                <button type="button" className="eye-btn" onClick={() => setShow2(!show2)} aria-label={show2 ? 'Hide password' : 'Show password'}>
                  <i className={`fa-solid ${show2 ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn-submit" disabled={busy}>
              <i className={busy ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-user-plus'} /> Create Account
            </button>
          </form>

          <div className="divider">already a member?</div>

          <div className="footer-link">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>← Sign in to your account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
