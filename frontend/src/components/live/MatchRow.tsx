'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSocketEvent, type LiveScoreUpdate, type LiveStatusUpdate } from '@/lib/socket';
import { useSubscriptions } from '@/lib/subscriptions';
import { useNow } from '@/lib/hooks';
import { isLiveStatus, liveMinute } from '@/lib/minute';
import { playGoalSound } from '@/lib/sound';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { MatchSummary } from '@/lib/types';

export type MatchData = MatchSummary;

export function MatchRow({ match }: { match: MatchSummary }) {
  const { isSubscribed, isPending, toggle } = useSubscriptions();
  const now = useNow(15000);
  // Nadpisanie z WebSocketu obowiązuje, dopóki REST nie dostarczy nowszych danych (propKey się zmieni).
  const propKey = `${match.homeScore}:${match.awayScore}:${match.status}`;
  const [override, setOverride] = useState<{ propKey: string; home: number; away: number; status: string } | null>(null);
  const live_ = override && override.propKey === propKey ? override : null;
  const score = { home: live_?.home ?? match.homeScore, away: live_?.away ?? match.awayScore };
  const status = live_?.status ?? match.status;
  const [goalSide, setGoalSide] = useState<'home' | 'away' | 'both' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useSocketEvent<LiveScoreUpdate>('live_score_update', (u) => {
    if (u.matchApiId !== match.apiId) return;
    setOverride({ propKey, home: u.homeScore, away: u.awayScore, status: u.status });
    if (u.goal) {
      setGoalSide(u.scoringSide ?? 'both');
      playGoalSound();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setGoalSide(null), 5000);
    }
  });
  useSocketEvent<LiveStatusUpdate>('live_status_update', (u) => {
    if (u.matchApiId === match.apiId) setOverride({ propKey, home: score.home, away: score.away, status: u.status });
  });

  const subscribed = isSubscribed(match.id);
  const pending = isPending(match.id);
  const live = isLiveStatus(status);
  const minute = liveMinute({ periodStartMinute: match.periodStartMinute, matchTime: match.matchTime, status }, now);

  const onBell = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    try {
      await toggle(match.id, match.apiId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className={`group flex items-center justify-between p-3.5 hover:bg-zinc-800/40 transition-colors ${goalSide ? 'anim-goal-flash' : ''}`}>
      <Link href={`/match/${match.id}`} className="flex-1 flex items-center gap-4 min-w-0">
        <div className="w-16 flex flex-col items-center justify-center text-center flex-shrink-0">
          {live ? (
            <>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                {minute > 0 ? `${minute}'` : '•'}
              </span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{status}</span>
            </>
          ) : (
            <span className="text-xs text-zinc-500 font-medium">{status}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-6 pr-2">
          <div className="flex-1 flex items-center justify-between sm:justify-end gap-2 min-w-0">
            <span className={`text-sm truncate ${goalSide === 'home' || goalSide === 'both' ? 'text-emerald-300 font-bold' : 'text-zinc-200 font-medium'}`}>
              {match.homeTeam?.name ?? 'Home'}
            </span>
            <TeamLogo apiId={match.homeTeam?.apiId} name={match.homeTeam?.name ?? 'H'} />
            <span className="text-sm font-bold text-zinc-100 sm:hidden">{score.home}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#181818] rounded-md font-mono font-bold text-sm tracking-widest text-zinc-100">
            <span key={`h${score.home}`} className={goalSide ? 'anim-score-bump inline-block' : 'inline-block'}>{score.home}</span>
            <span className="text-zinc-600">:</span>
            <span key={`a${score.away}`} className={goalSide ? 'anim-score-bump inline-block' : 'inline-block'}>{score.away}</span>
          </div>

          <div className="flex-1 flex items-center justify-between sm:justify-start gap-2 min-w-0">
            <span className="text-sm font-bold text-zinc-100 sm:hidden">{score.away}</span>
            <TeamLogo apiId={match.awayTeam?.apiId} name={match.awayTeam?.name ?? 'A'} />
            <span className={`text-sm truncate ${goalSide === 'away' || goalSide === 'both' ? 'text-emerald-300 font-bold' : 'text-zinc-200 font-medium'}`}>
              {match.awayTeam?.name ?? 'Away'}
            </span>
          </div>
        </div>
        {goalSide && <span className="anim-goal-pop text-xs font-extrabold text-emerald-400 flex-shrink-0">⚽ GOAL!</span>}
      </Link>

      <button
        onClick={onBell}
        disabled={pending}
        aria-pressed={subscribed}
        title={error ?? (subscribed ? 'Turn off alerts' : 'Get goal & card alerts')}
        className={`p-2 rounded-lg transition-all ml-2 disabled:opacity-60 ${
          error
            ? 'text-red-400 ring-1 ring-red-500/40'
            : subscribed
              ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 ring-1 ring-emerald-500/40'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <Bell className={`w-4 h-4 ${subscribed ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
