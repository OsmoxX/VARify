'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { useApi, useMounted } from '@/lib/hooks';
import { formatLocalTime, localDateStr, userTimeZone } from '@/lib/time';
import type { LeagueGroupData, TeamRef } from '@/lib/types';

interface Upcoming {
  id: number;
  apiId: number;
  startDatetime: string | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
}
interface CalendarResponse {
  date: string;
  tz: string;
  leagues: LeagueGroupData<Upcoming>[];
  total: number;
}

export default function CalendarPage() {
  const mounted = useMounted();
  const [selected, setSelected] = useState<string | null>(null);

  // 5 dni od "dziś" w strefie użytkownika (nie UTC — toISOString przesuwał dzień po północy)
  const days = useMemo(() => {
    if (!mounted) return [];
    const base = new Date();
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return {
        dateStr: localDateStr(d),
        weekday: d.toLocaleDateString([], { weekday: 'short' }),
        dayNumber: d.getDate(),
        month: d.toLocaleDateString([], { month: 'short' }),
      };
    });
  }, [mounted]);

  const date = selected ?? days[0]?.dateStr ?? null;
  const tz = mounted ? userTimeZone() : 'UTC';
  const { data, loading, error, reload } = useApi<CalendarResponse>(date ? `/calendar?date=${date}&tz=${encodeURIComponent(tz)}` : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Match Calendar</h1>
          <p className="text-xs text-zinc-400">Fixtures by day · times shown in your local time ({tz})</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d.dateStr}
            onClick={() => setSelected(d.dateStr)}
            className={`flex-1 min-w-[80px] p-3 rounded-xl border text-center transition-all ${
              d.dateStr === date ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold ring-1 ring-emerald-500/50' : 'bg-[#1e1e1e] border-[#2a2a2a] text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider">{d.weekday}</div>
            <div className="text-lg font-bold my-0.5 text-zinc-100">{d.dayNumber}</div>
            <div className="text-[10px] text-zinc-500">{d.month}</div>
          </button>
        ))}
      </div>

      {error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-red-400">{error.message}</p>
          <button onClick={reload} className="px-4 py-2 rounded-lg bg-zinc-800 text-xs text-white">Try again</button>
        </div>
      ) : loading || !data ? (
        <div className="py-20 text-center text-zinc-500 text-sm">Loading scheduled fixtures...</div>
      ) : data.leagues.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-sm">No matches scheduled for this date.</div>
      ) : (
        <div className="space-y-4">
          {data.leagues.map((lg) => (
            <div key={lg.leagueApiId} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
              <Link href={`/league/${lg.leagueApiId}`} className="px-4 py-2.5 bg-[#181818] border-b border-[#252525] flex items-center gap-2 hover:text-emerald-400">
                {lg.isTop && <Trophy className="w-4 h-4 text-amber-400" />}
                <span className="text-xs font-semibold text-zinc-200">{lg.leagueName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{lg.matches.length}</span>
              </Link>
              <div className="divide-y divide-[#252525]">
                {lg.matches.map((m) => (
                  <div key={m.id} className="p-3 flex items-center text-xs hover:bg-zinc-800/40">
                    <span className="w-14 text-zinc-500 font-mono text-center">{formatLocalTime(m.startDatetime)}</span>
                    <span className="flex-1 font-medium text-zinc-200 text-right truncate">{m.homeTeam?.name ?? 'Home'}</span>
                    <span className="px-3 text-zinc-600 font-bold">vs</span>
                    <span className="flex-1 font-medium text-zinc-200 truncate">{m.awayTeam?.name ?? 'Away'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
