'use client';

import { useEffect, useState } from 'react';
import { Search, Radio, RefreshCw } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { LeagueGroup } from '@/components/live/LeagueGroup';
import type { LeagueGroupData } from '@/lib/types';

interface LiveResponse {
  leagues: LeagueGroupData[];
  total: number;
}

export default function HomePage() {
  const { data, error, loading, reload } = useApi<LiveResponse>('/matches/live');
  const [search, setSearch] = useState('');
  const [onlyTop, setOnlyTop] = useState(false);

  // Odświeżanie co 60 s (wyniki w czasie rzeczywistym dostarcza WebSocket; to tylko siatka bezpieczeństwa)
  useEffect(() => {
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  const q = search.trim().toLowerCase();
  const leagues = (data?.leagues ?? [])
    .filter((lg) => !onlyTop || lg.isTop)
    .map((lg) =>
      q
        ? {
            ...lg,
            matches: lg.matches.filter(
              (m) =>
                (m.homeTeam?.name ?? '').toLowerCase().includes(q) ||
                (m.awayTeam?.name ?? '').toLowerCase().includes(q) ||
                lg.leagueName.toLowerCase().includes(q),
            ),
          }
        : lg,
    )
    .filter((lg) => lg.matches.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Live Matches
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">{data?.total ?? 0} active</span>
            </h1>
            <p className="text-xs text-zinc-400">Scores update in real time over WebSocket — no refresh needed</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
            <input type="checkbox" checked={onlyTop} onChange={(e) => setOnlyTop(e.target.checked)} className="accent-emerald-500" />
            Top leagues
          </label>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter team or league..."
              className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button onClick={reload} className="p-2 rounded-lg bg-[#1e1e1e] border border-[#333] text-zinc-400 hover:text-white" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && !data ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-red-400">{error.message}</p>
          <button onClick={reload} className="px-4 py-2 rounded-lg bg-zinc-800 text-xs text-white hover:bg-zinc-700">Try again</button>
        </div>
      ) : !data ? (
        <div className="py-20 text-center text-zinc-500 text-sm">Loading live football matches...</div>
      ) : leagues.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-sm">{q || onlyTop ? 'No matches match your filter.' : 'No live matches in progress right now.'}</div>
      ) : (
        <div>
          {error && <p className="text-xs text-amber-400 mb-3">Showing last known data — {error.message}</p>}
          {leagues.map((lg) => (
            <LeagueGroup key={lg.leagueApiId} league={lg} />
          ))}
        </div>
      )}
    </div>
  );
}
