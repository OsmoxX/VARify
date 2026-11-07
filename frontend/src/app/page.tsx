'use client';

import { useState, useEffect } from 'react';
import { Search, Radio, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { LeagueGroup, LeagueGroupData } from '@/components/live/LeagueGroup';

export default function HomePage() {
  const [leagues, setLeagues] = useState<LeagueGroupData[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [subscribedIds, setSubscribedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    try {
      const data = await api.get<{ leagues: LeagueGroupData[]; total: number }>(
        '/matches/live',
      );
      setLeagues(data.leagues ?? []);
      setTotalMatches(data.total ?? 0);

      // Subscribed IDs
      const subs = await api.get<number[]>('/notifications/subscribed').catch(() => []);
      setSubscribedIds(subs ?? []);
    } catch (err) {
      console.error('Error fetching live matches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 60_000);
    return () => clearInterval(interval);
  }, []);

  const filteredLeagues = leagues
    .map((lg) => {
      if (!search.trim()) return lg;
      const q = search.toLowerCase();
      const matchesFilter = lg.matches.filter(
        (m) =>
          (m.homeTeam?.name ?? '').toLowerCase().includes(q) ||
          (m.awayTeam?.name ?? '').toLowerCase().includes(q) ||
          lg.leagueName.toLowerCase().includes(q),
      );
      return { ...lg, matches: matchesFilter };
    })
    .filter((lg) => lg.matches.length > 0);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Live Matches
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                {totalMatches} active
              </span>
            </h1>
            <p className="text-xs text-zinc-400">Real-time scores synced via WebSocket</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team or league..."
              className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchMatches();
            }}
            className="p-2 rounded-lg bg-[#1e1e1e] border border-[#333] text-zinc-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && leagues.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          Loading live football matches...
        </div>
      ) : filteredLeagues.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          {search ? 'No matches matching your search.' : 'No live matches in progress right now.'}
        </div>
      ) : (
        <div>
          {filteredLeagues.map((league) => (
            <LeagueGroup
              key={league.leagueApiId}
              league={league}
              subscribedIds={subscribedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
