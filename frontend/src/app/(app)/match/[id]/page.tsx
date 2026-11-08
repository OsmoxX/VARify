'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BarChart3, Clock, Users } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useMatchRoom, useSocketEvent, type LiveScoreUpdate, type LiveStatusUpdate, type MatchEventPayload } from '@/lib/socket';
import { useSubscriptions } from '@/lib/subscriptions';
import { useNow } from '@/lib/hooks';
import { isLiveStatus, liveMinute } from '@/lib/minute';
import { playGoalSound } from '@/lib/sound';
import { formatLocalTime } from '@/lib/time';
import { Paywall } from '@/components/ui/Paywall';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { MatchSummary, Tier } from '@/lib/types';

interface EventItem {
  id: number;
  incidentType: string;
  time: number;
  formattedTime: string;
  side: 'home' | 'away' | 'neutral';
  playerName: string | null;
  assistPlayerName: string | null;
  playerInName: string | null;
  playerOutName: string | null;
  injury: boolean;
  homeScore: number | null;
  awayScore: number | null;
  incidentClass: string | null;
  cardColor: string | null;
  reason: string | null;
  rescinded: boolean;
  text: string | null;
  injuryTimeLength: number | null;
  confirmed: boolean | null;
}
interface LineupPlayer {
  id: number;
  playerName: string;
  playerApiId: number | null;
  shirtNumber: number | null;
  position: string | null;
  isCaptain: boolean;
  avgRating: string | null;
}
interface PitchSpot {
  player: LineupPlayer;
  top: number;
  left: number;
  ratingClass: string;
}
interface Missing {
  id: number;
  playerName: string;
  type: string;
  reason: string | null;
}
interface StatPeriod {
  period: string;
  items: Array<{ name: string; home: string | number; away: string | number; homePct: number; awayPct: number; isPossession: boolean }>;
}
interface DetailResponse {
  match: MatchSummary & { homeFormation: string | null; awayFormation: string | null };
  events: EventItem[];
  access: { tier: Tier; lineups: boolean; stats: boolean };
  lineups: { homeXi: LineupPlayer[]; homeSubs: LineupPlayer[]; awayXi: LineupPlayer[]; awaySubs: LineupPlayer[] } | null;
  pitchHome: PitchSpot[] | null;
  pitchAway: PitchSpot[] | null;
  missingHome: Missing[] | null;
  missingAway: Missing[] | null;
  stats: StatPeriod[] | null;
}

const RATING_BG: Record<string, string> = {
  'rating-green': 'bg-emerald-500',
  'rating-yellow': 'bg-amber-500',
  'rating-red': 'bg-red-500',
  '': 'bg-zinc-600',
};

const CLASS_LABEL: Record<string, string> = {
  ownGoal: 'own goal',
  penalty: 'penalty',
  missedPenalty: 'missed penalty',
  penaltyNotAwarded: 'penalty not awarded',
  goalCancelled: 'goal cancelled',
  cardUpgrade: 'card upgraded',
  penaltyNotGiven: 'penalty overturned',
  penaltyGiven: 'penalty awarded',
  scored: 'scored',
  missed: 'missed',
  penaltyAwarded: 'penalty awarded',
};

function EventRow({ e }: { e: EventItem }) {
  if (e.incidentType === 'period') {
    return <div className="text-center text-[11px] font-bold text-zinc-400 py-1.5 border-y border-dashed border-[#2d2d2d] my-1">{e.text} {e.homeScore !== null && `· ${e.homeScore}-${e.awayScore}`}</div>;
  }
  if (e.incidentType === 'injuryTime') {
    return <div className="text-center text-[11px] text-zinc-500 py-1">+{e.injuryTimeLength ?? '?'} min added time</div>;
  }
  let icon = 'ℹ️';
  let title = e.playerName ?? '';
  let sub = '';
  switch (e.incidentType) {
    case 'goal':
      icon = '⚽';
      sub = [e.assistPlayerName && `assist: ${e.assistPlayerName}`, e.incidentClass && CLASS_LABEL[e.incidentClass]].filter(Boolean).join(' · ');
      break;
    case 'card':
      icon = e.cardColor === 'red' ? '🟥' : e.cardColor === 'yellow-red' ? '🟨🟥' : '🟨';
      sub = [e.reason, e.rescinded && 'rescinded by VAR'].filter(Boolean).join(' · ');
      break;
    case 'substitution':
      icon = '🔄';
      title = e.playerInName ?? '';
      sub = `↔ ${e.playerOutName ?? ''}${e.injury ? ' (injury)' : ''}`;
      break;
    case 'varDecision':
      icon = '📺';
      sub = ['VAR', e.incidentClass && (CLASS_LABEL[e.incidentClass] ?? e.incidentClass), e.confirmed === false && 'not confirmed'].filter(Boolean).join(' · ');
      break;
    case 'inGamePenalty':
      icon = '🎯';
      sub = e.incidentClass ? (CLASS_LABEL[e.incidentClass] ?? e.incidentClass) : 'penalty';
      break;
  }
  const right = e.side === 'away';
  return (
    <div className={`flex items-center gap-3 py-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className="w-12 text-center text-xs font-mono text-zinc-500 flex-shrink-0">{e.formattedTime}&apos;</span>
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-100 truncate">{title}</p>
        {sub && <p className="text-[11px] text-zinc-500 truncate">{sub}</p>}
      </div>
      {e.incidentType === 'goal' && e.homeScore !== null && (
        <span className="font-mono text-xs font-bold text-emerald-400 flex-shrink-0">{e.homeScore}-{e.awayScore}</span>
      )}
    </div>
  );
}

function Bench({ title, players }: { title: string; players: LineupPlayer[] }) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">{title}</h4>
      <ul className="space-y-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs text-zinc-300">
            <span className="w-6 text-right font-mono text-zinc-500">{p.shirtNumber ?? ''}</span>
            <span className="truncate">{p.playerName}</span>
            {p.avgRating && <span className="ml-auto text-[10px] text-zinc-500">{p.avgRating}</span>}
          </li>
        ))}
        {players.length === 0 && <li className="text-xs text-zinc-600">—</li>}
      </ul>
    </div>
  );
}

export default function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready, tier } = useAuth();
  const { isSubscribed, isPending, toggle } = useSubscriptions();
  const now = useNow(15000);
  // Dane z REST (ponowne pobranie po zmianie konta/planu — zakres danych zależy od tieru).
  const { data: fetched, error, reload } = useApi<DetailResponse>(ready ? `/matches/${id}?u=${user?.id ?? 0}&t=${tier}` : null);
  // Nadpisanie z WebSocketu dotyczy konkretnego obiektu `fetched`; nowe dane z REST je unieważniają.
  const [liveOverride, setLive] = useState<{ base: DetailResponse; home: number; away: number; status: string } | null>(null);
  const [tab, setTab] = useState<'timeline' | 'lineups' | 'stats'>('timeline');
  const [period, setPeriod] = useState(0);
  const [goalBanner, setGoalBanner] = useState(false);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const data: DetailResponse | undefined =
    fetched && liveOverride && liveOverride.base === fetched
      ? { ...fetched, match: { ...fetched.match, homeScore: liveOverride.home, awayScore: liveOverride.away, status: liveOverride.status } }
      : fetched;

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  const apiId = data?.match.apiId ?? null;
  useMatchRoom(apiId);

  // Nowy incydent/zmiana wyniku → odśwież oś czasu (z krótkim opóźnieniem, aby zebrać serię zdarzeń)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(reload, 1500);
  }, [reload]);

  useSocketEvent<LiveScoreUpdate>('live_score_update', (u) => {
    if (u.matchApiId !== apiId || !fetched) return;
    setLive({ base: fetched, home: u.homeScore, away: u.awayScore, status: u.status });
    if (u.goal) {
      setGoalBanner(true);
      playGoalSound();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setGoalBanner(false), 5000);
    }
    scheduleRefetch();
  });
  useSocketEvent<LiveStatusUpdate>('live_status_update', (u) => {
    if (u.matchApiId !== apiId || !fetched || !data) return;
    setLive({ base: fetched, home: data.match.homeScore, away: data.match.awayScore, status: u.status });
    scheduleRefetch();
  });
  useSocketEvent<MatchEventPayload>('match_event', (e) => {
    if (e.matchApiId === apiId) scheduleRefetch();
  });

  if (error && !data) {
    return (
      <div className="py-20 text-center text-zinc-400 space-y-3">
        <p>{error.status === 404 ? 'Match not found.' : error.message}</p>
        <Link href="/" className="text-emerald-400 underline text-sm">Back to Live Matches</Link>
      </div>
    );
  }
  if (!data) return <div className="py-20 text-center text-zinc-500 text-sm">Loading match details...</div>;

  const { match, events, access, lineups } = data;
  const live = isLiveStatus(match.status);
  const minute = liveMinute({ periodStartMinute: match.periodStartMinute, matchTime: match.matchTime, status: match.status }, now);
  const subscribed = isSubscribed(match.id);
  const stats = data.stats ?? [];
  const activePeriod = stats[Math.min(period, Math.max(stats.length - 1, 0))];

  const tabs = [
    { key: 'timeline' as const, label: 'Timeline', icon: Clock },
    { key: 'lineups' as const, label: 'Lineups', icon: Users },
    { key: 'stats' as const, label: 'Stats', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to Live Matches
      </Link>

      <div className="relative bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-6 shadow-lg overflow-hidden">
        {goalBanner && (
          <div className="absolute inset-x-0 top-0 flex justify-center pointer-events-none">
            <span className="anim-goal-pop mt-2 px-5 py-1.5 rounded-full bg-emerald-500 text-black text-sm font-extrabold tracking-wide shadow-lg shadow-emerald-500/30">⚽ GOAL!</span>
          </div>
        )}
        <div className="text-center text-xs text-zinc-400 mb-2">
          {match.league && <Link href={`/league/${match.league.apiId}`} className="hover:text-emerald-400">{match.league.name}</Link>}
          {match.league?.country && ` • ${match.league.country}`}
          {match.startDatetime && ` • ${formatLocalTime(match.startDatetime)}`}
        </div>
        <div className="flex items-center justify-between max-w-2xl mx-auto py-4 gap-2">
          <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-white text-right truncate">
              {match.homeTeam ? <Link href={`/team/${match.homeTeam.id}`} className="hover:text-emerald-400">{match.homeTeam.name}</Link> : 'Home'}
            </h2>
            <TeamLogo apiId={match.homeTeam?.apiId} name={match.homeTeam?.name ?? 'H'} size={36} />
          </div>
          <div className="px-4 sm:px-6 flex flex-col items-center">
            <div key={`${match.homeScore}-${match.awayScore}`} className={`flex items-center gap-3 font-mono text-3xl sm:text-4xl font-extrabold text-white ${goalBanner ? 'anim-score-bump' : ''}`}>
              <span>{match.homeScore}</span>
              <span className="text-zinc-600">:</span>
              <span>{match.awayScore}</span>
            </div>
            <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${live ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
              <span>{live && minute > 0 ? `${minute}' · ${match.status}` : match.status}</span>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <TeamLogo apiId={match.awayTeam?.apiId} name={match.awayTeam?.name ?? 'A'} size={36} />
            <h2 className="text-base sm:text-xl font-bold text-white truncate">
              {match.awayTeam ? <Link href={`/team/${match.awayTeam.id}`} className="hover:text-emerald-400">{match.awayTeam.name}</Link> : 'Away'}
            </h2>
          </div>
        </div>
        <div className="flex justify-center mt-2">
          <button
            onClick={() => void toggle(match.id, match.apiId).catch(() => {})}
            disabled={isPending(match.id)}
            aria-pressed={subscribed}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-60 ${
              subscribed ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <Bell className={`w-3.5 h-3.5 ${subscribed ? 'fill-current' : ''}`} />
            {subscribed ? 'Alerts on' : 'Get alerts'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[#262626]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 divide-y divide-[#242424]">
          {events.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-8">No events yet.</p>
          ) : (
            events.map((e) => <EventRow key={e.id} e={e} />)
          )}
        </div>
      )}

      {tab === 'lineups' &&
        (!access.lineups || !lineups ? (
          <Paywall required="PLUS" feature="Lineups and the formation pitch" loggedIn={!!user} />
        ) : (
          <div className="space-y-6">
            <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
              <div className="flex justify-between text-sm font-semibold text-white mb-3">
                <span>{match.homeTeam?.name} {match.homeFormation && <span className="ml-1 text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{match.homeFormation}</span>}</span>
                <span>{match.awayFormation && <span className="mr-1 text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{match.awayFormation}</span>} {match.awayTeam?.name}</span>
              </div>
              <div className="pitch-field relative w-full aspect-[2/1] rounded-lg border-2 border-white/30 overflow-hidden">
                {[...(data.pitchHome ?? []), ...(data.pitchAway ?? [])].map((s) => (
                  <div
                    key={`${s.left}-${s.top}-${s.player.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                    style={{ left: `${s.left}%`, top: `${s.top}%` }}
                    title={`${s.player.playerName}${s.player.avgRating ? ` · ${s.player.avgRating}` : ''}`}
                  >
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full ${RATING_BG[s.ratingClass] ?? 'bg-zinc-600'} border-2 border-white/80 text-[10px] sm:text-xs font-bold text-white flex items-center justify-center`}>
                      {s.player.shirtNumber ?? ''}
                    </div>
                    <span className="hidden sm:block mt-0.5 max-w-[5.5rem] truncate text-[10px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">
                      {s.player.playerName.split(' ').slice(-1)[0]}{s.player.isCaptain ? ' (C)' : ''}
                    </span>
                  </div>
                ))}
                {!data.pitchHome?.length && !data.pitchAway?.length && (
                  <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Lineups not announced yet</p>
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
              <Bench title={`${match.homeTeam?.name ?? 'Home'} — substitutes`} players={lineups.homeSubs} />
              <Bench title={`${match.awayTeam?.name ?? 'Away'} — substitutes`} players={lineups.awaySubs} />
            </div>
            {[...(data.missingHome ?? []), ...(data.missingAway ?? [])].length > 0 && (
              <div className="grid sm:grid-cols-2 gap-6 bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
                {[
                  { team: match.homeTeam?.name, list: data.missingHome ?? [] },
                  { team: match.awayTeam?.name, list: data.missingAway ?? [] },
                ].map(({ team, list }) => (
                  <div key={team}>
                    <h4 className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">{team} — unavailable</h4>
                    <ul className="space-y-1">
                      {list.map((m) => (
                        <li key={m.id} className="text-xs text-zinc-300">
                          {m.type === 'doubtful' ? '❔' : '🚑'} {m.playerName}
                          {m.reason && <span className="text-zinc-500"> · {m.reason}</span>}
                        </li>
                      ))}
                      {list.length === 0 && <li className="text-xs text-zinc-600">—</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      {tab === 'stats' &&
        (!access.stats ? (
          <Paywall required="PREMIUM" feature="Advanced match statistics" loggedIn={!!user} />
        ) : stats.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-10">No statistics available for this match.</p>
        ) : (
          <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 space-y-4">
            <div className="flex gap-2">
              {stats.map((p, i) => (
                <button key={p.period} onClick={() => setPeriod(i)} className={`px-3 py-1 rounded-md text-xs ${i === period ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                  {p.period === 'ALL' ? 'Full match' : p.period === '1ST' ? '1st half' : p.period === '2ND' ? '2nd half' : p.period}
                </button>
              ))}
            </div>
            {activePeriod?.items.map((it) => (
              <div key={it.name}>
                <div className="flex justify-between text-xs text-zinc-300 mb-1">
                  <span className="font-semibold">{it.home}</span>
                  <span className="text-zinc-500">{it.name}</span>
                  <span className="font-semibold">{it.away}</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
                  <div className="bg-emerald-500" style={{ width: `${it.homePct}%` }} />
                  <div className="bg-sky-500" style={{ width: `${it.awayPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
