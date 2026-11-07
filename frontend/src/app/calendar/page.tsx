'use client';

import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { api } from '@/lib/api';

interface UpcomingMatchData {
  id: number;
  apiId: number;
  homeTeam: { id: number; name: string } | null;
  awayTeam: { id: number; name: string } | null;
  startDatetime: string | null;
  isTop: boolean;
}

interface CalendarResponse {
  date: string;
  leagues: Array<{
    leagueName: string;
    isTop: boolean;
    matches: UpcomingMatchData[];
  }>;
  total: number;
}

interface DayItem {
  dateStr: string;
  weekday: string;
  dayNumber: number;
  month: string;
}

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [days, setDays] = useState<DayItem[]>([]);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize dates client-side after mount
  useEffect(() => {
    const list: DayItem[] = Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        dateStr: d.toISOString().split('T')[0]!,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
      };
    });
    setDays(list);
    if (list[0]) {
      setSelectedDate(list[0].dateStr);
    }
  }, []);

  useEffect(() => {
    if (!selectedDate) return;

    async function load() {
      setLoading(true);
      try {
        const res = await api.get<CalendarResponse>(
          `/calendar?date=${selectedDate}`,
        );
        setData(res);
      } catch (err) {
        console.error('Failed to load calendar:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedDate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Match Calendar</h1>
          <p className="text-xs text-zinc-400">Scheduled football fixtures by day</p>
        </div>
      </div>

      {/* 5-Day Picker */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const isSelected = d.dateStr === selectedDate;
          return (
            <button
              key={d.dateStr}
              onClick={() => setSelectedDate(d.dateStr)}
              className={`flex-1 min-w-[80px] p-3 rounded-xl border text-center transition-all ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold ring-1 ring-emerald-500/50'
                  : 'bg-[#1e1e1e] border-[#2a2a2a] text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider">{d.weekday}</div>
              <div className="text-lg font-bold my-0.5 text-zinc-100">{d.dayNumber}</div>
              <div className="text-[10px] text-zinc-500">{d.month}</div>
            </button>
          );
        })}
      </div>

      {/* Fixtures list */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          Loading scheduled fixtures...
        </div>
      ) : !data || data.leagues.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          No matches scheduled for this date.
        </div>
      ) : (
        <div className="space-y-4">
          {data.leagues.map((lg, idx) => (
            <div
              key={idx}
              className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-[#181818] border-b border-[#252525] flex items-center gap-2">
                {lg.isTop && <Trophy className="w-4 h-4 text-amber-400" />}
                <span className="text-xs font-semibold text-zinc-200">
                  {lg.leagueName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {lg.matches.length}
                </span>
              </div>

              <div className="divide-y divide-[#252525]">
                {lg.matches.map((m) => {
                  const time = m.startDatetime
                    ? new Date(m.startDatetime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--';
                  return (
                    <div
                      key={m.id}
                      className="p-3 flex items-center justify-between text-xs hover:bg-zinc-800/40"
                    >
                      <span className="w-12 text-zinc-500 font-mono text-center">
                        {time}
                      </span>
                      <div className="flex-1 flex items-center justify-between px-4">
                        <span className="font-medium text-zinc-200 text-right flex-1 truncate">
                          {m.homeTeam?.name ?? 'Home'}
                        </span>
                        <span className="px-3 text-zinc-600 font-bold">vs</span>
                        <span className="font-medium text-zinc-200 text-left flex-1 truncate">
                          {m.awayTeam?.name ?? 'Away'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
