'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Paywall } from '@/components/ui/Paywall';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { hasAccess } from '@/lib/types';

interface SearchResponse {
  query: string;
  teams: Array<{ id: number; apiId: number; name: string }>;
  players: Array<{ apiId: number; name: string; position: string | null; team: { name: string } | null }>;
}

export default function SearchPage() {
  const q = (useSearchParams().get('q') ?? '').trim();
  const { user, tier, ready } = useAuth();
  const allowed = ready && hasAccess(tier, 'PLUS');
  const { data, loading, error } = useApi<SearchResponse>(allowed && q.length >= 2 ? `/search?q=${encodeURIComponent(q)}` : null);

  if (!ready) return <div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>;
  if (!allowed) return <div className="max-w-xl mx-auto py-10"><Paywall required="PLUS" feature="Team and player search" loggedIn={!!user} /></div>;
  if (q.length < 2) return <div className="py-20 text-center text-zinc-500 text-sm">Type at least 2 characters in the search bar.</div>;
  if (error) return <div className="py-20 text-center text-red-400 text-sm">{error.message}</div>;
  if (loading || !data) return <div className="py-20 text-center text-zinc-500 text-sm">Searching...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">Results for &ldquo;{data.query}&rdquo;</h1>
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">Teams ({data.teams.length})</h2>
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl divide-y divide-[#252525]">
          {data.teams.length === 0 && <p className="p-4 text-xs text-zinc-500">No teams found.</p>}
          {data.teams.map((t) => (
            <Link key={t.id} href={`/team/${t.id}`} className="flex items-center gap-3 p-3 text-sm text-zinc-200 hover:bg-zinc-800/40"><TeamLogo apiId={t.apiId} name={t.name} size={24} />{t.name}</Link>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">Players ({data.players.length})</h2>
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl divide-y divide-[#252525]">
          {data.players.length === 0 && <p className="p-4 text-xs text-zinc-500">No players found.</p>}
          {data.players.map((p) => (
            <Link key={p.apiId} href={`/player/${p.apiId}`} className="flex items-center justify-between p-3 text-sm text-zinc-200 hover:bg-zinc-800/40">
              <span>{p.name}</span><span className="text-xs text-zinc-500">{[p.position, p.team?.name].filter(Boolean).join(' · ')}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
