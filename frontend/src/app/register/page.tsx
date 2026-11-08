'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register, user, ready } = useAuth();
  const router = useRouter();
  const raw = useSearchParams().get('next');
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Registration failed');
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500';
  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
      <p className="text-xs text-zinc-400 mb-6">Follow teams, get goal alerts and unlock Pro features.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-zinc-400">Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></label>
        <label className="block text-xs text-zinc-400">Username<input required minLength={3} maxLength={30} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={field} /></label>
        <label className="block text-xs text-zinc-400">Password (min. 8 characters)<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label>
        <label className="block text-xs text-zinc-400">Repeat password<input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} /></label>
        {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
        <button disabled={busy} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-semibold text-white flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign up
        </button>
      </form>
      <p className="text-xs text-zinc-500 mt-6 text-center">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-emerald-400 underline">Log in</Link>
      </p>
    </div>
  );
}
