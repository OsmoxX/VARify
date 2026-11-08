'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BellOff, Bell, Search, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { TeamLogo } from '@/components/ui/TeamLogo';

interface Fav {
  id: number;
  apiId: number;
  name: string;
  isActive: boolean;
}
interface SearchTeam {
  id: number;
  apiId: number;
  name: string;
  isFavorite: boolean;
}

export default function FavoritesPage() {
  const { user, ready } = useAuth();
  const { data, loading, error, reload } = useApi<{ favorites: Fav[] }>(user ? '/favorites' : null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTeam[] | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  if (!ready) return <div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>;
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <Star className="w-10 h-10 mx-auto text-amber-400" />
        <h1 className="text-xl font-bold text-white">Favorite teams</h1>
        <p className="text-sm text-zinc-400">Log in to follow your clubs and get alerts whenever they play.</p>
        <Link href="/login?next=/favorites" className="inline-block px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white">Log in</Link>
      </div>
    );
  }

  const run = async (teamId: number, fn: () => Promise<void>) => {
    if (busy.has(teamId)) return; // brak równoległych żądań dla tej samej drużyny
    setBusy((b) => new Set(b).add(teamId));
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(teamId);
        return n;
      });
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    try {
      const res = await api.get<{ teams: SearchTeam[] }>(`/favorites/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.teams);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const toggle = (team: { id: number }) =>
    run(team.id, async () => {
      const res = await api.post<{ isFavorite: boolean }>(`/favorites/${team.id}/toggle`);
      setResults((r) => r?.map((t) => (t.id === team.id ? { ...t, isFavorite: res.isFavorite } : t)) ?? r);
      reload();
    });

  const setActive = (team: Fav) =>
    run(team.id, async () => {
      await api.patch(`/favorites/${team.id}`, { isActive: !team.isActive });
      reload();
    });

  const favorites = data?.favorites ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Star className="w-5 h-5 fill-current" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Favorite teams</h1>
          <p className="text-xs text-zinc-400">You&apos;ll get alerts (goals, cards, kick-off, full time) for every match of these clubs</p>
        </div>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a club to follow (e.g. Liverpool, Arsenal)..."
            className="w-full bg-[#1e1e1e] border border-[#333] rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <button className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium">Search</button>
      </form>

      {message && <p className="text-xs text-red-400">{message}</p>}

      {results && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl divide-y divide-[#252525]">
          {results.length === 0 && <p className="p-5 text-center text-xs text-zinc-500">No clubs found. Only teams with matches in VARify can be followed.</p>}
          {results.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3">
              <TeamLogo apiId={t.apiId} name={t.name} size={28} />
              <span className="flex-1 text-sm text-zinc-200 truncate">{t.name}</span>
              <button
                onClick={() => void toggle(t)}
                disabled={busy.has(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${t.isFavorite ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                {t.isFavorite ? '★ Following' : '☆ Follow'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Following ({favorites.length})</h2>
        {error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : loading && !data ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : favorites.length === 0 ? (
          <p className="text-sm text-zinc-500 py-8 text-center bg-[#181818] border border-dashed border-[#2a2a2a] rounded-xl">You&apos;re not following any teams yet.</p>
        ) : (
          <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl divide-y divide-[#252525]">
            {favorites.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3">
                <TeamLogo apiId={f.apiId} name={f.name} size={28} />
                <Link href={`/team/${f.id}`} className="flex-1 text-sm text-zinc-200 hover:text-emerald-400 truncate">{f.name}</Link>
                <button
                  onClick={() => void setActive(f)}
                  disabled={busy.has(f.id)}
                  title={f.isActive ? 'Mute alerts' : 'Unmute alerts'}
                  className={`p-2 rounded-lg disabled:opacity-50 ${f.isActive ? 'text-emerald-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  {f.isActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
                <button onClick={() => void toggle(f)} disabled={busy.has(f.id)} className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                  Unfollow
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
