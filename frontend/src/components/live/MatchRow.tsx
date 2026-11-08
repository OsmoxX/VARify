'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSocketEvent, type LiveScoreUpdate, type LiveStatusUpdate } from '@/lib/socket';
import { useSubscriptions } from '@/lib/subscriptions';
import { useNow } from '@/lib/hooks';
import { liveMinute } from '@/lib/minute';
import { statusClass, statusLabel } from '@/lib/status';
import { playGoalSound } from '@/lib/sound';
import type { MatchSummary } from '@/lib/types';

export type MatchData = MatchSummary;

/** Wiersz meczu w układzie Django (`.match-row-wrapper` > `.match-row` + `.bell-btn`) z animacją gola na żywo. */
export function MatchRow({ match }: { match: MatchSummary }) {
  const { isSubscribed, isPending, toggle } = useSubscriptions();
  const now = useNow(15000);

  // Nadpisanie z WebSocketu obowiązuje, dopóki REST nie dostarczy nowszych danych (propKey się zmieni).
  const propKey = `${match.homeScore}:${match.awayScore}:${match.status}`;
  const [override, setOverride] = useState<{ propKey: string; home: number; away: number; status: string } | null>(null);
  const live = override && override.propKey === propKey ? override : null;
  const home = live?.home ?? match.homeScore;
  const away = live?.away ?? match.awayScore;
  const status = live?.status ?? match.status;

  const [goalSide, setGoalSide] = useState<'home' | 'away' | 'both' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
    if (u.matchApiId === match.apiId) setOverride({ propKey, home, away, status: u.status });
  });

  const cls = statusClass(status);
  const minute = liveMinute({ periodStartMinute: match.periodStartMinute, matchTime: match.matchTime, status }, now);
  const subscribed = isSubscribed(match.id);

  const onBell = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    try {
      await toggle(match.id, match.apiId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić powiadomień');
    }
  };

  return (
    <div className={`match-row-wrapper${goalSide ? ' anim-goal-flash' : ''}`}>
      <Link href={`/match/${match.id}`} className="match-row">
        <div className="team team-home" style={goalSide === 'home' || goalSide === 'both' ? { color: '#34d399' } : undefined}>{match.homeTeam?.name ?? '—'}</div>
        <div className="score-container">
          <div className={`score-display${goalSide ? ' anim-score-bump' : ''}`} key={`${home}-${away}`}>
            {home} - {away}
          </div>
          <div className={`match-status-label ${cls}`}>
            {statusLabel(status)}
            {cls === 'status-live' && minute > 0 ? ` · ${minute}'` : ''}
          </div>
          {goalSide && <div className="anim-goal-pop" style={{ color: '#34d399', fontWeight: 800, fontSize: '0.75rem' }}>⚽ GOL!</div>}
        </div>
        <div className="team team-away" style={goalSide === 'away' || goalSide === 'both' ? { color: '#34d399' } : undefined}>{match.awayTeam?.name ?? '—'}</div>
      </Link>
      <button
        className={`bell-btn${subscribed ? ' bell-active' : ''}`}
        onClick={onBell}
        disabled={isPending(match.id)}
        aria-pressed={subscribed}
        title={error ?? (subscribed ? 'Wyłącz powiadomienia' : 'Włącz powiadomienia')}
        aria-label={subscribed ? 'Wyłącz powiadomienia' : 'Włącz powiadomienia'}
        style={error ? { borderColor: '#ef4444', color: '#ef4444' } : undefined}
      >
        <i className="fa-solid fa-bell" />
      </button>
    </div>
  );
}
