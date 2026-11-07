'use client';

import { useState } from 'react';
import { Check, Shield, Zap, Crown, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

export default function SubscribePage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (plan: 'plus' | 'premium') => {
    setLoadingPlan(plan);
    try {
      const res = await api.post<{ url?: string; error?: string }>(
        `/stripe/checkout/${plan}`,
        {},
      );
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert(res.error ?? 'Could not initialize Stripe checkout.');
      }
    } catch {
      alert('Failed to connect to checkout service. Please check your login status.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const tiers = [
    {
      name: 'FREE',
      icon: Shield,
      price: '$0',
      period: 'forever',
      description: 'Essential football tracking for casual supporters.',
      features: [
        'Live scores & match status',
        'Grouped leagues & schedule',
        'Standard match timelines',
        'Basic player search',
      ],
      current: true,
      buttonText: 'Current Plan',
      buttonDisabled: true,
    },
    {
      name: 'PLUS',
      icon: Zap,
      price: '$4.99',
      period: 'per month',
      description: 'Instant alerts and tactical breakdowns.',
      features: [
        'Everything in FREE',
        'Instant WebSocket goal & card notifications',
        'Full tactical lineups & formation pitch view',
        'Team standings & form tracking',
        'Priority live updates',
      ],
      highlight: true,
      planKey: 'plus' as const,
      buttonText: 'Upgrade to Plus',
    },
    {
      name: 'PREMIUM',
      icon: Crown,
      price: '$9.99',
      period: 'per month',
      description: 'Ultimate experience with AI Football Analyst.',
      features: [
        'Everything in PLUS',
        'Unlimited AI Football Analyst inquiries',
        'Head-to-head match predictive stats',
        'Exclusive VIP Crown badge',
        'VIP low-latency data stream',
      ],
      planKey: 'premium' as const,
      buttonText: 'Upgrade to Premium',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Supercharge Your Matchday with{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
            VARify Pro
          </span>
        </h1>
        <p className="text-sm text-zinc-400 max-w-lg mx-auto">
          Get real-time push alerts, visual tactical pitch layouts, and intelligent AI match analysis.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const isPlus = tier.name === 'PLUS';
          const isPremium = tier.name === 'PREMIUM';

          return (
            <div
              key={tier.name}
              className={`rounded-2xl p-6 flex flex-col justify-between border relative ${
                isPlus
                  ? 'bg-gradient-to-b from-emerald-950/40 via-[#1c1c1c] to-[#181818] border-emerald-500/60 shadow-xl shadow-emerald-950/20'
                  : isPremium
                  ? 'bg-gradient-to-b from-purple-950/30 via-[#1c1c1c] to-[#181818] border-purple-500/50 shadow-xl shadow-purple-950/20'
                  : 'bg-[#1a1a1a] border-[#2a2a2a]'
              }`}
            >
              {isPlus && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-extrabold tracking-wider uppercase">
                  Most Popular
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isPlus
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : isPremium
                        ? 'bg-purple-500/15 text-purple-400'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{tier.price}</span>{' '}
                  <span className="text-xs text-zinc-500">/ {tier.period}</span>
                </div>

                <p className="text-xs text-zinc-400 mb-6">{tier.description}</p>

                <div className="space-y-2.5 mb-8">
                  {tier.features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {tier.current ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-500 text-xs font-semibold cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => tier.planKey && handleCheckout(tier.planKey)}
                    disabled={loadingPlan === tier.planKey}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      isPlus
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                    }`}
                  >
                    {loadingPlan === tier.planKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      tier.buttonText
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
