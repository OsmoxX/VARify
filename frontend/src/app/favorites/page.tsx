'use client';

import { useState } from 'react';
import { Star, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface TeamItem {
  id: number;
  apiId: number;
  name: string;
}

export default function FavoritesPage() {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TeamItem[]>([]);
  const [favorites, setFavorites] = useState<TeamItem[]>([
    { id: 1, apiId: 2817, name: 'Barcelona' },
    { id: 2, apiId: 2829, name: 'Real Madrid' },
  ]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;

    setSearching(true);
    try {
      const res = await api.get<{ teams: TeamItem[] }>(
        `/teams/search?q=${encodeURIComponent(search.trim())}`,
      );
      setSearchResults(res.teams ?? []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const addFavorite = (team: TeamItem) => {
    if (!favorites.some((t) => t.apiId === team.apiId)) {
      setFavorites([...favorites, team]);
    }
  };

  const removeFavorite = (apiId: number) => {
    setFavorites(favorites.filter((t) => t.apiId !== apiId));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Star className="w-5 h-5 fill-current" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Favorite Teams</h1>
          <p className="text-xs text-zinc-400">Track and receive alerts whenever your clubs play</p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search football club to add to favorites (e.g. Liverpool, Arsenal)..."
            className="w-full bg-[#1e1e1e] border border-[#333] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-2">Search Results</h3>
          <div className="divide-y divide-[#2a2a2a]">
            {searchResults.map((t) => (
              <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                <span className="font-medium text-white">{t.name}</span>
                <button
                  onClick={() => addFavorite(t)}
                  className="px-3 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-medium transition-colors"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Favorites List */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5">
        <h2 className="text-sm font-bold text-white mb-4">Your Tracked Clubs ({favorites.length})</h2>

        {favorites.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            You haven&apos;t added any favorite teams yet. Use the search bar above to start tracking clubs!
          </div>
        ) : (
          <div className="divide-y divide-[#252525]">
            {favorites.map((team) => (
              <div key={team.apiId} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Star className="w-4 h-4 text-amber-400 fill-current" />
                  <span className="text-sm font-semibold text-zinc-100">{team.name}</span>
                </div>
                <button
                  onClick={() => removeFavorite(team.apiId)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                  title="Remove from favorites"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
