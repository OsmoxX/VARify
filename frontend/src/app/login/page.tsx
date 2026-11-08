'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

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
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Log in</h1>
      <p className="text-xs text-zinc-400 mb-6">Welcome back to VARify.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-zinc-400">
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </label>
        <label className="block text-xs text-zinc-400">
          Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </label>
        {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
        <button disabled={busy} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-semibold text-white flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Log in
        </button>
      </form>
      <p className="text-xs text-zinc-500 mt-6 text-center">
        No account? <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-emerald-400 underline">Sign up</Link>
      </p>
    </div>
  );
}
