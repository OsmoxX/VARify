import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { Tier } from '@/lib/types';

/** Soft paywall: blokada funkcji z zachętą do zakupu (backend i tak nie wyda danych bez planu). */
export function Paywall({ required, feature, loggedIn }: { required: Exclude<Tier, 'FREE'>; feature: string; loggedIn: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-[#333] bg-[#181818] p-8 text-center space-y-3">
      <div className="mx-auto w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
        <Lock className="w-5 h-5" />
      </div>
      <p className="text-sm text-zinc-200 font-semibold">{feature} requires the {required} plan</p>
      <p className="text-xs text-zinc-500">Upgrade to unlock this and more.</p>
      <div className="flex justify-center gap-2 pt-1">
        {!loggedIn && (
          <Link href="/login" className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white">
            Log in
          </Link>
        )}
        <Link href="/subscribe" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white">
          See plans
        </Link>
      </div>
    </div>
  );
}
