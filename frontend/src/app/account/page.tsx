'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, CreditCard, Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';
import { disablePush, enablePush, isPushEnabled, pushSupported } from '@/lib/push';

const input = 'mt-1 w-full bg-[#181818] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50';

export default function AccountPage() {
  const { user, tier, ready, refresh, logout } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [push, setPush] = useState<boolean | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [initFor, setInitFor] = useState<number | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace('/login?next=/account');
  }, [ready, user, router]);

  // Inicjalizacja pól formularza raz na użytkownika (bez setState w ciele efektu: tylko "ustaw gdy zmieniony")
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

  if (!ready || !user) return <div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>;
  const canRename = hasAccess(tier, 'PLUS');

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await api.patch('/account/profile', { email: email.trim(), ...(canRename ? { username: username.trim() } : {}) });
      await refresh();
      setProfileMsg({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Update failed' });
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    try {
      await api.post('/account/password', { currentPassword: curPw, newPassword: newPw });
      setCurPw('');
      setNewPw('');
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change password' });
    }
  };

  const togglePush = async () => {
    setPushMsg(null);
    try {
      if (push) await disablePush();
      else await enablePush();
      setPush(await isPushEnabled());
    } catch (err) {
      setPushMsg(err instanceof ApiError || err instanceof Error ? err.message : 'Failed');
    }
  };

  const billing = async () => {
    try {
      const res = await api.post<{ url: string }>('/stripe/portal');
      window.location.href = res.url;
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Billing portal unavailable' });
    }
  };

  const card = 'bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 space-y-4';
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-white">Account</h1>

      <section className={card}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500">Current plan</p>
            <p className="text-lg font-bold text-white">{tier}</p>
            {user.subscriptionStatus === 'past_due' && <p className="text-xs text-amber-400 mt-1">Payment failed — update your card to keep your plan.</p>}
          </div>
          <div className="flex gap-2">
            {tier !== 'FREE' && (
              <button onClick={() => void billing()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white">
                <CreditCard className="w-4 h-4" /> Billing
              </button>
            )}
            {tier !== 'PREMIUM' && <Link href="/subscribe" className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white">Upgrade</Link>}
          </div>
        </div>
      </section>

      <form onSubmit={saveProfile} className={card}>
        <h2 className="text-sm font-semibold text-white">Profile</h2>
        <label className="block text-xs text-zinc-400">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></label>
        <label className="block text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">Username {!canRename && <Lock className="w-3 h-3 text-amber-400" />}</span>
          <input value={username} minLength={3} maxLength={30} disabled={!canRename} onChange={(e) => setUsername(e.target.value)} className={input} />
          {!canRename && <span className="text-[11px] text-zinc-500">Changing the username requires the PLUS plan.</span>}
        </label>
        {profileMsg && <p className={`text-xs ${profileMsg.ok ? 'text-emerald-400' : 'text-red-400'}`} role="status">{profileMsg.text}</p>}
        <button className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white">Save</button>
      </form>

      <form onSubmit={changePw} className={card}>
        <h2 className="text-sm font-semibold text-white">Change password</h2>
        <label className="block text-xs text-zinc-400">Current password<input type="password" required autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className={input} /></label>
        <label className="block text-xs text-zinc-400">New password (min. 8 characters)<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={input} /></label>
        {pwMsg && <p className={`text-xs ${pwMsg.ok ? 'text-emerald-400' : 'text-red-400'}`} role="status">{pwMsg.text}</p>}
        <button className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm font-semibold text-white">Update password</button>
      </form>

      <section className={card}>
        <h2 className="text-sm font-semibold text-white flex items-center gap-2"><BellRing className="w-4 h-4" /> Push notifications</h2>
        <p className="text-xs text-zinc-400">Get goal, card and kick-off alerts on this device even when VARify is closed.</p>
        {pushSupported() ? (
          <button onClick={() => void togglePush()} disabled={push === null} className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${push ? 'bg-zinc-700 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
            {push ? 'Disable on this device' : 'Enable on this device'}
          </button>
        ) : (
          <p className="text-xs text-zinc-500">Push is not supported in this browser.</p>
        )}
        {pushMsg && <p className="text-xs text-red-400">{pushMsg}</p>}
      </section>

      <button onClick={() => { logout(); router.push('/'); }} className="text-xs text-red-400 hover:underline">Log out</button>
    </div>
  );
}
