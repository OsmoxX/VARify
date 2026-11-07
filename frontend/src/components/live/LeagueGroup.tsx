'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { MatchRow, MatchData } from './MatchRow';

export interface LeagueGroupData {
  leagueApiId: string;
  leagueName: string;
  country: string | null;
  isTop: boolean;
  matches: MatchData[];
}

export function LeagueGroup({
  league,
  subscribedIds = [],
  defaultExpanded = true,
}: {
  league: LeagueGroupData;
  subscribedIds?: number[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-sm mb-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-[#181818] hover:bg-zinc-800/60 flex items-center justify-between border-b border-[#252525] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {league.isTop && (
            <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          <span className="font-semibold text-sm text-zinc-100">
            {league.leagueName}
          </span>
          {league.country && (
            <span className="text-xs text-zinc-500 font-normal">
              • {league.country}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
            {league.matches.length}
          </span>
        </div>

        <div className="text-zinc-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Matches */}
      {expanded && (
        <div className="divide-y divide-[#252525]">
          {league.matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              initialSubscribed={subscribedIds.includes(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
