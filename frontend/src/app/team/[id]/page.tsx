'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Paywall } from '@/components/ui/Paywall';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Paginated, TeamRef } from '@/lib/types';

interface TeamResponse {
  team: TeamRef;
  isFavorite: boolean;
  league: { apiId: string; name: string } | null;
  standings: Array<{ position: number; points: number; matchesPlayed: number; goalDifference: number; team: TeamRef; isCurrent: boolean }>;
  players: Array<{ id: number; apiId: number; name: string; position: string | null; jerseyNumber: number | null }>;
}
interface RecentMatch {
  id: number;
  status: string;
  homeScore: number;
  awayScore: number;
  matchDate: string | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useAuth();
  const { data, error, loading } = useApi<TeamResponse>(ready && user ? `/teams/${id}` : null);
  const matches = useApi<Paginated<RecentMatch>>(data ? `/teams/${id}/matches` : null);
  const [fav, setFav] = useState<{ teamId: string; value: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>;
  if (!user) return <div className="max-w-xl mx-auto py-10"><Paywall required="PLUS" feature="Team pages" loggedIn={false} /></div>;
  if (error?.isPaywall) return <div className="max-w-xl mx-auto py-10"><Paywall required="PLUS" feature="Team pages" loggedIn /></div>;
  if (error) return <div className="py-20 text-center text-zinc-400">{error.status === 404 ? 'Team not found.' : error.message}</div>;
  if (loading || !data) return <div className="py-20 text-center text-zinc-500 text-sm">Loading team...</div>;

  const isFavorite = fav?.teamId === id ? fav.value : data.isFavorite;
  const toggleFav = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ isFavorite: boolean }>(`/favorites/${data.team.id}/toggle`);
      setFav({ teamId: id, value: res.isFavorite });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 pb-3 border-b border-[#222]">
        <TeamLogo apiId={data.team.apiId} name={data.team.name} size={56} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{data.team.name}</h1>
          {data.league && <Link href={`/league/${data.league.apiId}`} className="text-xs text-zinc-400 hover:text-emerald-400">{data.league.name}</Link>}
        </div>
        <button onClick={() => void toggleFav()} disabled={busy} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 ${isFavorite ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} /> {isFavorite ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <h3 className="px-4 py-2.5 bg-[#181818] text-xs font-semibold text-zinc-300 border-b border-[#252525]">Recent matches</h3>
          <div className="divide-y divide-[#252525]">
            {(matches.data?.results ?? []).length === 0 && <p className="p-4 text-xs text-zinc-500 text-center">{matches.loading ? 'Loading…' : 'No matches yet.'}</p>}
            {(matches.data?.results ?? []).map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="flex items-center p-3 text-xs hover:bg-zinc-800/40">
                <span className="w-20 text-zinc-500 font-mono">{m.matchDate ?? ''}</span>
                <span className="flex-1 text-right truncate text-zinc-200">{m.homeTeam?.name}</span>
                <span className="px-3 font-mono font-bold text-white">{m.homeScore} : {m.awayScore}</span>
                <span className="flex-1 truncate text-zinc-200">{m.awayTeam?.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <h3 className="px-4 py-2.5 bg-[#181818] text-xs font-semibold text-zinc-300 border-b border-[#252525]">League table</h3>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-[#252525]">
              {data.standings.length === 0 && <tr><td className="p-4 text-center text-zinc-500">No standings available.</td></tr>}
              {data.standings.map((s) => (
                <tr key={s.team.id} className={s.isCurrent ? 'bg-emerald-500/10' : ''}>
                  <td className="p-2.5 w-8 text-zinc-500">{s.position}</td>
                  <td className="p-2.5"><Link href={`/team/${s.team.id}`} className="text-zinc-200 hover:text-emerald-400">{s.team.name}</Link></td>
                  <td className="p-2.5 text-center text-zinc-400">{s.matchesPlayed}</td>
                  <td className="p-2.5 text-center text-zinc-400">{s.goalDifference}</td>
                  <td className="p-2.5 text-center font-bold text-white">{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {data.players.length > 0 && (
        <section className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-3">Squad</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.players.map((p) => (
              <Link key={p.id} href={`/player/${p.apiId}`} className="flex items-center gap-2 text-xs text-zinc-300 hover:text-emerald-400">
                <span className="w-6 text-right font-mono text-zinc-500">{p.jerseyNumber ?? ''}</span>{p.name}
                {p.position && <span className="ml-auto text-zinc-600">{p.position}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
