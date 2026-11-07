'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useSocket } from '@/lib/socket';
import { api } from '@/lib/api';

export interface MatchData {
  id: number;
  apiId: number;
  homeTeam: { id: number; name: string } | null;
  awayTeam: { id: number; name: string } | null;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: number;
  matchTime: string | null;
  isTop: boolean;
}

export function MatchRow({
  match,
  initialSubscribed = false,
}: {
  match: MatchData;
  initialSubscribed?: boolean;
}) {
  const { onScoreUpdate, joinMatch, leaveMatch } = useSocket();
  const [homeScore, setHomeScore] = useState(match.homeScore);
  const [awayScore, setAwayScore] = useState(match.awayScore);
  const [status, setStatus] = useState(match.status);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [highlight, setHighlight] = useState(false);

  // Real-time live score updates via WebSocket
  useEffect(() => {
    const unsub = onScoreUpdate((update) => {
      if (update.matchApiId === match.apiId) {
        setHomeScore(update.homeScore);
        setAwayScore(update.awayScore);
        setStatus(update.status);
        setHighlight(true);
        setTimeout(() => setHighlight(false), 2500);
      }
    });

    return unsub;
  }, [match.apiId, onScoreUpdate]);

  const handleToggleSubscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await api.post<{ subscribed: boolean }>(
        `/notifications/matches/${match.id}/toggle`,
        {},
      );
      setSubscribed(res.subscribed);
      if (res.subscribed) {
        joinMatch(match.apiId);
      } else {
        leaveMatch(match.apiId);
      }
    } catch (err) {
      console.error('Failed to toggle notifications:', err);
    }
  };

  const isLive = !['Ended', 'Cancelled', 'Postponed', 'Not started'].includes(status);

  return (
    <div
      className={`group flex items-center justify-between p-3.5 hover:bg-zinc-800/40 border-b border-[#252525] last:border-b-0 transition-all ${
        highlight ? 'bg-emerald-950/40 border-emerald-500/50' : ''
      }`}
    >
      <Link href={`/match/${match.id}`} className="flex-1 flex items-center gap-4">
        {/* Status / Minute */}
        <div className="w-16 flex flex-col items-center justify-center text-center">
          {isLive ? (
            <>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                {match.minute > 0 ? `${match.minute}'` : status}
              </span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{status}</span>
            </>
          ) : (
            <span className="text-xs text-zinc-500 font-medium">{status}</span>
          )}
        </div>

        {/* Teams & Score */}
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-6 pr-4">
          {/* Home team */}
          <div className="flex-1 flex items-center justify-between sm:justify-start gap-2">
            <span className="text-sm font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
              {match.homeTeam?.name ?? 'Home'}
            </span>
            <span className="text-sm font-bold text-zinc-100 sm:hidden">{homeScore}</span>
          </div>

          {/* Desktop Score */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#181818] rounded-md font-mono font-bold text-sm tracking-widest text-zinc-100">
            <span>{homeScore}</span>
            <span className="text-zinc-600">:</span>
            <span>{awayScore}</span>
          </div>

          {/* Away team */}
          <div className="flex-1 flex items-center justify-between sm:justify-end gap-2">
            <span className="text-sm font-bold text-zinc-100 sm:hidden">{awayScore}</span>
            <span className="text-sm font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors truncate text-right">
              {match.awayTeam?.name ?? 'Away'}
            </span>
          </div>
        </div>
      </Link>

      {/* Bell Toggle */}
      <button
        onClick={handleToggleSubscribe}
        title={subscribed ? 'Unsubscribe from alerts' : 'Receive goal & card alerts'}
        className={`p-2 rounded-lg transition-all ml-2 ${
          subscribed
            ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 ring-1 ring-emerald-500/40'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <Bell className="w-4 h-4 fill-current" />
      </button>
    </div>
  );
}
