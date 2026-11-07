'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Users, Clock, BarChart3, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/socket';

interface EventItem {
  id: number;
  incidentType: string;
  time: number;
  addedTime: number;
  isHome: boolean;
  playerName: string | null;
  assistPlayerName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  incidentClass: string | null;
  reason: string | null;
  playerInName: string | null;
  playerOutName: string | null;
  text: string | null;
}

interface LineupPlayer {
  id: number;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  isCaptain: boolean;
  avgRating: string | null;
}

interface MatchDetailResponse {
  match: {
    id: number;
    apiId: number;
    homeTeam: { id: number; name: string } | null;
    awayTeam: { id: number; name: string } | null;
    league: { id: number; name: string; country: string | null } | null;
    homeScore: number;
    awayScore: number;
    status: string;
    minute: number;
    homeFormation: string | null;
    awayFormation: string | null;
    statsJson: Record<string, unknown> | null;
    events: EventItem[];
  };
  lineups: {
    homeXi: LineupPlayer[];
    homeSubs: LineupPlayer[];
    awayXi: LineupPlayer[];
    awaySubs: LineupPlayer[];
  };
  pitchHome: Array<{ row: number; players: LineupPlayer[] }>;
  pitchAway: Array<{ row: number; players: LineupPlayer[] }>;
  missingHome: Array<{ id: number; playerName: string; type: string; reason: string | null }>;
  missingAway: Array<{ id: number; playerName: string; type: string; reason: string | null }>;
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { onMatchEvent, joinMatch, leaveMatch } = useSocket();
  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'lineups' | 'stats'>('timeline');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<MatchDetailResponse>(`/matches/${id}`);
        setData(res);

        if (res.match) {
          joinMatch(res.match.apiId);
        }
      } catch (err) {
        console.error('Failed to load match detail:', err);
      } finally {
        setLoading(false);
      }
    }
    load();

    return () => {
      if (data?.match) {
        leaveMatch(data.match.apiId);
      }
    };
  }, [id, joinMatch, leaveMatch, data?.match]);

  // Listen to events for this match
  useEffect(() => {
    const unsub = onMatchEvent((evt) => {
      if (evt.homeScore != null && evt.awayScore != null && data?.match) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                match: {
                  ...prev.match,
                  homeScore: evt.homeScore!,
                  awayScore: evt.awayScore!,
                  status: evt.status ?? prev.match.status,
                },
              }
            : null,
        );
      }
    });

    return unsub;
  }, [data?.match, onMatchEvent]);

  if (loading) {
    return (
      <div className="py-20 text-center text-zinc-500 text-sm">
        Loading match details...
      </div>
    );
  }

  if (!data || !data.match) {
    return (
      <div className="py-20 text-center text-zinc-400">
        Match not found.{' '}
        <Link href="/" className="text-emerald-400 underline">
          Back to Live Matches
        </Link>
      </div>
    );
  }

  const { match, lineups, pitchHome, pitchAway, missingHome, missingAway } = data;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Live Matches
      </Link>

      {/* Match Score Banner */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-6 shadow-lg">
        <div className="text-center text-xs text-zinc-400 mb-2">
          {match.league?.name} {match.league?.country && `• ${match.league.country}`}
        </div>

        <div className="flex items-center justify-between max-w-2xl mx-auto py-4">
          {/* Home */}
          <div className="flex-1 text-right">
            <h2 className="text-base sm:text-xl font-bold text-white">
              {match.homeTeam?.name ?? 'Home'}
            </h2>
          </div>

          {/* Score & Status */}
          <div className="px-6 flex flex-col items-center">
            <div className="flex items-center gap-3 font-mono text-3xl sm:text-4xl font-extrabold text-white">
              <span>{match.homeScore}</span>
              <span className="text-zinc-600">:</span>
              <span>{match.awayScore}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>{match.minute > 0 ? `${match.minute}'` : match.status}</span>
            </div>
          </div>

          {/* Away */}
          <div className="flex-1 text-left">
            <h2 className="text-base sm:text-xl font-bold text-white">
              {match.awayTeam?.name ?? 'Away'}
            </h2>
          </div>
        </div>

        {/* Subscribe button */}
        <div className="flex justify-center mt-2">
          <button
            onClick={async () => {
              const res = await api.post<{ subscribed: boolean }>(
                `/notifications/matches/${match.id}/toggle`,
                {},
              );
              setSubscribed(res.subscribed);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              subscribed
                ? 'bg-emerald-500 text-black font-semibold'
                : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {subscribed ? 'Subscribed to Alerts' : 'Notify me of events'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a] gap-2">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'timeline'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Timeline ({match.events?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('lineups')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'lineups'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Lineups
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'stats'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Statistics
        </button>
      </div>

      {/* Tab 1: Timeline */}
      {activeTab === 'timeline' && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5">
          {!match.events || match.events.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-500">
              No incidents reported yet for this match.
            </div>
          ) : (
            <div className="space-y-3">
              {match.events.map((evt) => {
                const isGoal = evt.incidentType === 'goal';
                const isCard = evt.incidentType === 'card';
                const isSub = evt.incidentType === 'substitution';

                return (
                  <div
                    key={evt.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border ${
                      evt.isHome
                        ? 'bg-zinc-800/40 border-zinc-700/50'
                        : 'bg-zinc-800/20 border-zinc-700/30 ml-auto'
                    } max-w-xl`}
                  >
                    <span className="font-mono text-xs font-bold text-emerald-400 w-10">
                      {evt.time}&apos;
                      {evt.addedTime > 0 ? `+${evt.addedTime}` : ''}
                    </span>

                    <span className="text-xl">
                      {isGoal && '⚽'}
                      {isCard && (evt.incidentClass === 'red' ? '🟥' : '🟨')}
                      {isSub && '🔄'}
                      {!isGoal && !isCard && !isSub && '⏱️'}
                    </span>

                    <div className="flex-1 text-xs">
                      {isGoal && (
                        <div>
                          <span className="font-bold text-white">{evt.playerName}</span>
                          <span className="text-zinc-400 ml-2">
                            ({evt.homeScore}:{evt.awayScore})
                          </span>
                          {evt.assistPlayerName && (
                            <p className="text-[11px] text-zinc-400">
                              Assist: {evt.assistPlayerName}
                            </p>
                          )}
                        </div>
                      )}
                      {isCard && (
                        <div>
                          <span className="font-bold text-white">{evt.playerName}</span>
                          {evt.reason && (
                            <span className="text-zinc-400 ml-2">({evt.reason})</span>
                          )}
                        </div>
                      )}
                      {isSub && (
                        <div className="text-zinc-300">
                          <span className="text-emerald-400 font-medium">↑ {evt.playerInName}</span>
                          <span className="text-red-400 font-medium ml-2">↓ {evt.playerOutName}</span>
                        </div>
                      )}
                      {!isGoal && !isCard && !isSub && (
                        <span className="text-zinc-300">{evt.text ?? evt.incidentType}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Lineups */}
      {activeTab === 'lineups' && (
        <div className="space-y-6">
          {/* Pitch formation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Home Pitch */}
            <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">
                {match.homeTeam?.name} ({match.homeFormation ?? '4-3-3'})
              </h3>
              <div className="bg-gradient-to-b from-emerald-950/60 to-green-950/40 border border-emerald-900/50 rounded-lg p-4 space-y-4 min-h-[300px] flex flex-col justify-around">
                {pitchHome.map((row) => (
                  <div key={row.row} className="flex justify-around items-center">
                    {row.players.map((p) => (
                      <div key={p.id} className="flex flex-col items-center text-center">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center justify-center shadow">
                          {p.shirtNumber ?? '•'}
                        </div>
                        <span className="text-[10px] text-zinc-200 mt-1 max-w-[70px] truncate">
                          {p.playerName}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Home Subs */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-zinc-400 mb-2">Substitutes</h4>
                <div className="divide-y divide-[#2a2a2a]">
                  {lineups.homeSubs.map((p) => (
                    <div key={p.id} className="py-1.5 flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{p.playerName}</span>
                      <span className="text-zinc-500">#{p.shirtNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Away Pitch */}
            <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">
                {match.awayTeam?.name} ({match.awayFormation ?? '4-4-2'})
              </h3>
              <div className="bg-gradient-to-b from-blue-950/60 to-indigo-950/40 border border-blue-900/50 rounded-lg p-4 space-y-4 min-h-[300px] flex flex-col justify-around">
                {pitchAway.map((row) => (
                  <div key={row.row} className="flex justify-around items-center">
                    {row.players.map((p) => (
                      <div key={p.id} className="flex flex-col items-center text-center">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-xs flex items-center justify-center shadow">
                          {p.shirtNumber ?? '•'}
                        </div>
                        <span className="text-[10px] text-zinc-200 mt-1 max-w-[70px] truncate">
                          {p.playerName}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Away Subs */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-zinc-400 mb-2">Substitutes</h4>
                <div className="divide-y divide-[#2a2a2a]">
                  {lineups.awaySubs.map((p) => (
                    <div key={p.id} className="py-1.5 flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{p.playerName}</span>
                      <span className="text-zinc-500">#{p.shirtNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Missing / Doubtful players */}
          {(missingHome.length > 0 || missingAway.length > 0) && (
            <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
              <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-3">
                <AlertCircle className="w-4 h-4" />
                Missing & Doubtful Players
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h5 className="font-semibold text-zinc-300 mb-1">{match.homeTeam?.name}</h5>
                  {missingHome.map((p) => (
                    <div key={p.id} className="text-zinc-400 py-0.5">
                      • {p.playerName} ({p.reason ?? p.type})
                    </div>
                  ))}
                </div>
                <div>
                  <h5 className="font-semibold text-zinc-300 mb-1">{match.awayTeam?.name}</h5>
                  {missingAway.map((p) => (
                    <div key={p.id} className="text-zinc-400 py-0.5">
                      • {p.playerName} ({p.reason ?? p.type})
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Stats */}
      {activeTab === 'stats' && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-6 text-center text-xs text-zinc-500">
          Detailed match statistics are populated during live match progress.
        </div>
      )}
    </div>
  );
}
