'use client';

import '@/styles/account.css';
import '@/styles/account-push.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';
import { disablePush, enablePush, isPushEnabled, pushSupported } from '@/lib/push';

type Msg = { ok: boolean; text: string } | null;

function PasswordField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      <label htmlFor={id}>{label} {hint && <small>({hint})</small>}</label>
      <div className="input-eye-wrapper">
        <input type={show ? 'text' : 'password'} id={id} className="form-input" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={id === 'current_password' ? 'current-password' : 'new-password'} maxLength={72} />
        <button type="button" className="toggle-eye" onClick={() => setShow(!show)} aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}>
          <i className={`fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`} />
        </button>
      </div>
    </div>
  );
}

/** Ustawienia konta — port `account_settings.html`. */
export default function AccountPage() {
  const { user, tier, ready, refresh } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [initFor, setInitFor] = useState<number | null>(null);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [push, setPush] = useState<boolean | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace('/login?next=/account');
  }, [ready, user, router]);

  // Inicjalizacja pól raz na użytkownika
  if (user && initFor !== user.id) {
    setInitFor(user.id);
    setEmail(user.email);
    setUsername(user.username);
  }

  useEffect(() => {
    let cancelled = false;
    void isPushEnabled().then((v) => {
      if (!cancelled) setPush(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !user) return <div className="vf-account"><div className="account-wrapper"><p className="account-subtitle">Ładowanie...</p></div></div>;
  const canRename = hasAccess(tier, 'PLUS');

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await api.patch('/account/profile', { email: email.trim(), ...(canRename ? { username: username.trim() } : {}) });
      await refresh();
      setProfileMsg({ ok: true, text: 'Dane profilu zostały zaktualizowane.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Nie udało się zapisać zmian.' });
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) return setPwMsg({ ok: false, text: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
    if (newPw !== confirmPw) return setPwMsg({ ok: false, text: 'Hasła nie są identyczne.' });
    try {
      await api.post('/account/password', { currentPassword: curPw, newPassword: newPw });
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ ok: true, text: 'Hasło zostało zmienione.' });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Nie udało się zmienić hasła.' });
    }
  };

  const togglePush = async () => {
    setPushMsg(null);
    try {
      if (push) await disablePush();
      else await enablePush();
      setPush(await isPushEnabled());
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : 'Nie udało się zmienić ustawienia');
    }
  };

  const openPortal = async () => {
    try {
      const res = await api.post<{ url: string }>('/stripe/portal');
      window.location.href = res.url;
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Panel płatności jest niedostępny.' });
    }
  };

  const alert = (m: Msg) =>
    m && (
      <div className={`account-alert account-alert-${m.ok ? 'success' : 'error'}`} role="status">
        <i className={`fa-solid ${m.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} /> {m.text}
      </div>
    );

  return (
    <div className="vf-account">
      <div className="account-wrapper">
        <Link className="back-btn-modern" href="/"><i className="fa-solid fa-chevron-left" /> Powrót</Link>

        <div className="account-header">
          <div className="account-avatar"><i className="fa-solid fa-circle-user" /></div>
          <div>
            <h1 className="account-title">{user.username}</h1>
            <p className="account-subtitle">Ustawienia konta</p>
          </div>
        </div>

        {/* SUBSKRYPCJA */}
        <div className="account-card">
          <h2 className="account-card-title sub-card-header">
            <span><i className="fa-solid fa-credit-card" /> Twoja Subskrypcja</span>
            {tier === 'PREMIUM' ? (
              <span className="sub-card-badge premium"><i className="fa-solid fa-crown" /> Wyższy Plan PREMIUM</span>
            ) : tier === 'PLUS' ? (
              <span className="sub-card-badge plus"><i className="fa-solid fa-star" /> Aktywny Plan PLUS</span>
            ) : (
              <span className="sub-card-badge free">Darmowy Plan FREE</span>
            )}
          </h2>
          <div className="sub-info-container">
            <div className="sub-info-box">
              <p className="sub-info-label">Status Konta</p>
              <div className="sub-info-status">
                <span className="status-dot" style={user.subscriptionStatus === 'past_due' ? { background: '#f59e0b' } : undefined} />
                <span className="status-text">{user.subscriptionStatus === 'past_due' ? 'Płatność nieudana — zaktualizuj kartę' : 'Aktywne (Zgodne z regulaminem)'}</span>
              </div>
            </div>
            {tier !== 'FREE' && (
              <div className="sub-info-box">
                <p className="sub-info-label">Cykl Rozliczeniowy</p>
                <p className="sub-info-value">Odświeżane automatycznie (co miesiąc)</p>
                <p className="sub-info-footer"><i className="fa-brands fa-stripe" /> Bezpieczne płatności obsługiwane i chronione przez Stripe.</p>
              </div>
            )}
            <div className="sub-action-wrapper">
              <Link href="/subscribe" className={`btn-sub-action ${tier === 'FREE' ? 'free' : 'active-sub'}`}>
                {tier === 'FREE' ? (<><i className="fa-solid fa-arrow-up-right-from-square" /> Poznaj możliwości ulepszenia planu</>) : tier === 'PLUS' ? (<><i className="fa-solid fa-crown" /> Przełącz na Premium</>) : (<><i className="fa-solid fa-gear" /> Zapoznaj się z ofertami</>)}
              </Link>
              {tier !== 'FREE' && (
                <button type="button" className="btn-sub-action active-sub" style={{ marginTop: 8, cursor: 'pointer' }} onClick={() => void openPortal()}>
                  <i className="fa-solid fa-credit-card" /> Zarządzaj / anuluj subskrypcję
                </button>
              )}
            </div>
          </div>
        </div>

        {/* DANE PROFILU */}
        <div className="account-card">
          <h2 className="account-card-title"><i className="fa-solid fa-user-pen" /> Dane profilu</h2>
          {alert(profileMsg)}
          <form className="account-form" onSubmit={saveProfile}>
            <div className="form-group">
              <label htmlFor="username">Nazwa użytkownika</label>
              {canRename ? (
                <input type="text" id="username" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={30} />
              ) : (
                <>
                  <div className="input-locked-wrapper">
                    <input type="text" id="username" className="form-input input-locked" value={username} readOnly title="Zmiana nicku wymaga planu PLUS" />
                    <i className="fa-solid fa-lock input-lock-icon" style={{ color: '#f59e0b' }} />
                  </div>
                  <span className="form-hint-locked">
                    <i className="fa-solid fa-lock" style={{ fontSize: '0.7rem' }} /> Zmiana nicku dostępna od planu <Link href="/subscribe" className="hint-upgrade-link">PLUS →</Link>
                  </span>
                </>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="email">Adres e-mail</label>
              <input type="email" id="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <button type="submit" className="btn-save"><i className="fa-solid fa-floppy-disk" /> Zapisz zmiany</button>
          </form>
        </div>

        {/* PUSH */}
        <div className="account-card">
          <h2 className="account-card-title"><i className="fa-solid fa-bell" /> Powiadomienia (Push)</h2>
          <div className="push-settings-container">
            <div className="push-settings-text">
              <p><strong>Wyniki na żywo i powiadomienia</strong></p>
              <p className="text-muted">Bądź na bieżąco, nawet gdy aplikacja jest zamknięta.</p>
              {pushMsg && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{pushMsg}</p>}
              {!pushSupported() && <p className="text-muted">Ta przeglądarka nie obsługuje powiadomień push.</p>}
            </div>
            <label className="push-switch" title="Włącz powiadomienia na tym urządzeniu">
              <input type="checkbox" checked={!!push} disabled={push === null || !pushSupported()} onChange={() => void togglePush()} />
              <span className="push-slider" />
            </label>
          </div>
        </div>

        {/* HASŁO */}
        <div className="account-card">
          <h2 className="account-card-title"><i className="fa-solid fa-lock" /> Zmiana hasła</h2>
          {alert(pwMsg)}
          <form className="account-form" onSubmit={changePw}>
            <PasswordField id="current_password" label="Obecne hasło" value={curPw} onChange={setCurPw} />
            <PasswordField id="new_password" label="Nowe hasło" hint="min. 8 znaków" value={newPw} onChange={setNewPw} />
            <PasswordField id="confirm_password" label="Powtórz nowe hasło" value={confirmPw} onChange={setConfirmPw} />
            <button type="submit" className="btn-save btn-save-danger"><i className="fa-solid fa-key" /> Zmień hasło</button>
          </form>
        </div>
      </div>
    </div>
  );
}
