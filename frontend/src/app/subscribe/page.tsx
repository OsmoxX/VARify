'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Crown, Loader2, Shield, Zap } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TIER_LEVEL, type Tier } from '@/lib/types';

const TIERS = [
  {
    name: 'FREE' as const,
    icon: Shield,
    price: '$0',
    description: 'Essential football tracking for casual supporters.',
    features: ['Live scores & match status', 'Real-time goal animations', 'Match timelines', 'Match alerts (bell) & favorite teams', 'Calendar'],
    plan: undefined,
  },
  {
    name: 'PLUS' as const,
    icon: Zap,
    price: '$4.99',
    description: 'Tactical breakdowns, search and team pages.',
    features: ['Everything in FREE', 'Lineups & formation pitch view', 'Team pages, standings & form', 'Global team & player search', 'Change your username'],
    plan: 'plus' as const,
  },
  {
    name: 'PREMIUM' as const,
    icon: Crown,
    price: '$9.99',
    description: 'The complete experience with the AI Football Analyst.',
    features: ['Everything in PLUS', 'AI Football Analyst', 'Advanced match statistics (xG & more)', 'VIP crown badge'],
    plan: 'premium' as const,
  },
];

export default function SubscribePage() {
  const { user, tier, ready, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const payment = params.get('payment');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsPortal, setNeedsPortal] = useState(false);

  // Po powrocie ze Stripe plan nadaje webhook (asynchronicznie) — odpytujemy krótko o nowy stan.
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

  const go = async (key: string, path: string) => {
    if (!user) {
      router.push('/login?next=/subscribe');
      return;
    }
    setBusy(key);
    setMessage(null);
    try {
      const res = await api.post<{ url: string }>(path, { locale: navigator.language.startsWith('pl') ? 'pl' : 'en' });
      window.location.href = res.url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setNeedsPortal(true);
      setMessage(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-6">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Supercharge your matchday with <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">VARify Pro</span>
        </h1>
        <p className="text-sm text-zinc-400 max-w-lg mx-auto">Tactical pitch layouts, powerful search and an AI analyst.</p>
      </div>

      {payment === 'success' && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm p-4 text-center">
          Payment received — activating your plan{tier === 'FREE' ? '…' : `: you are now on ${tier}!`}
        </div>
      )}
      {payment === 'cancelled' && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 text-zinc-300 text-sm p-4 text-center">Checkout cancelled — no charge was made.</div>
      )}
      {user && ready && tier !== 'FREE' && (
        <div className="text-center">
          <button onClick={() => void go('portal', '/stripe/portal')} className="text-xs text-zinc-400 underline hover:text-zinc-200">
            Manage billing / cancel subscription
          </button>
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 text-red-200 text-sm p-4 text-center space-y-2">
          <p>{message}</p>
          {needsPortal && (
            <button onClick={() => void go('portal', '/stripe/portal')} className="underline">Open billing portal</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((t) => {
          const Icon = t.icon;
          const current = ready && tier === t.name;
          const lower = TIER_LEVEL[t.name] < TIER_LEVEL[tier as Tier];
          const plus = t.name === 'PLUS';
          const premium = t.name === 'PREMIUM';
          return (
            <div
              key={t.name}
              className={`rounded-2xl p-6 flex flex-col justify-between border relative ${
                plus ? 'bg-gradient-to-b from-emerald-950/40 via-[#1c1c1c] to-[#181818] border-emerald-500/60'
                : premium ? 'bg-gradient-to-b from-purple-950/30 via-[#1c1c1c] to-[#181818] border-purple-500/50'
                : 'bg-[#1a1a1a] border-[#2a2a2a]'
              }`}
            >
              {current && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-black text-[10px] font-extrabold uppercase">Your plan</div>}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${plus ? 'bg-emerald-500/15 text-emerald-400' : premium ? 'bg-purple-500/15 text-purple-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t.name}</h3>
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{t.price}</span> <span className="text-xs text-zinc-500">/ month</span>
                </div>
                <p className="text-xs text-zinc-400 mb-6">{t.description}</p>
                <div className="space-y-2.5 mb-8">
                  {t.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-xs text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              {t.plan ? (
                <button
                  onClick={() => void go(t.plan, `/stripe/checkout/${t.plan}`)}
                  disabled={busy !== null || current || (ready && lower)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    plus ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {busy === t.plan && <Loader2 className="w-4 h-4 animate-spin" />}
                  {current ? 'Current plan' : lower ? 'Included in your plan' : `Upgrade to ${t.name[0]}${t.name.slice(1).toLowerCase()}`}
                </button>
              ) : (
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-500 cursor-not-allowed">
                  {current ? 'Current plan' : 'Free forever'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
