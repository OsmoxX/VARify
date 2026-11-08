'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { MatchRow } from './MatchRow';
import type { LeagueGroupData } from '@/lib/types';

export type { LeagueGroupData };

export function LeagueGroup({ league, defaultExpanded = true }: { league: LeagueGroupData; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-sm mb-4">
      <div className="w-full px-4 py-3 bg-[#181818] flex items-center justify-between border-b border-[#252525]">
        <Link href={`/league/${league.leagueApiId}`} className="flex items-center gap-2.5 min-w-0 hover:text-emerald-400">
          {league.isTop && <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />}
          <span className="font-semibold text-sm text-zinc-100 truncate">{league.leagueName}</span>
          {league.country && <span className="text-xs text-zinc-500 font-normal hidden sm:inline">• {league.country}</span>}
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">{league.matches.length}</span>
        </Link>
        <button onClick={() => setExpanded(!expanded)} className="text-zinc-400 hover:text-white p-1" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="divide-y divide-[#252525]">
          {league.matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
