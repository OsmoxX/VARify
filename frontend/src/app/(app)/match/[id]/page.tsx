'use client';

import '@/styles/match.css';
import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useMatchRoom, useSocketEvent, type LiveScoreUpdate, type LiveStatusUpdate, type MatchEventPayload } from '@/lib/socket';
import { useSubscriptions } from '@/lib/subscriptions';
import { useNow } from '@/lib/hooks';
import { playGoalSound } from '@/lib/sound';
import type { MatchSummary, Tier } from '@/lib/types';

interface EventItem {
  id: number;
  incidentType: string;
  time: number;
  addedTime: number | null;
  formattedTime: string;
  side: 'home' | 'away' | 'neutral';
  playerName: string | null;
  assistPlayerName: string | null;
  assist2PlayerName: string | null;
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

const CLASS_LABELS: Record<string, string> = {
  ownGoal: 'samobój',
  penalty: 'karny',
  missedPenalty: 'niestrzelony karny',
  penaltyNotAwarded: 'karny nie uznany',
  yellowRed: '2× żółta',
};
const POS_LABELS: Record<string, string> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' };

const firstWords = (name: string, n = 2) => {
  const w = name.trim().split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(' ')} …` : name;
};
const runningScore = (e: EventItem) => (e.homeScore !== null && e.awayScore !== null ? `${e.homeScore} - ${e.awayScore}` : '');

const PAUSED = ['halftime', 'half time', 'ht', 'pause', 'break'];
const LIVE_KW = ['half', 'live', 'progress', 'period', '1st', '2nd', 'extra', 'overtime'];

/** Zegar MM:SS — port updateMatchClock z `match_detail.js`. */
function clockText(m: MatchSummary, nowMs: number): string {
  const status = m.status.toLowerCase();
  if (PAUSED.some((k) => status.includes(k))) return 'HT';
  if (status === 'ended') return 'FT';
  if (!LIVE_KW.some((k) => status.includes(k))) return m.minute ? `${m.minute}:00` : m.status;
  const start = Number(m.matchTime) || 0;
  const initial = m.periodStartMinute;
  if (start <= 0) return `${m.minute}:00`;
  const elapsed = Math.max(0, Math.floor(nowMs / 1000) - start);
  const cur = initial + Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, '0');
  if (cur > 90 && !status.includes('extra')) return `90+${cur - 90}:${secs}`;
  if (cur > 45 && initial === 0) return `45+${cur - 45}:${secs}`;
  return `${cur}:${secs}`;
}

function FeedRow({ e }: { e: EventItem }) {
  const score = runningScore(e);
  const isGoal = e.incidentType === 'goal';
  const label = CLASS_LABELS[e.incidentClass ?? (isGoal ? e.incidentType : '')] ?? '';
  const timeLabel = e.formattedTime ? `${e.formattedTime}'` : '';
  let body: React.ReactNode;

  if (e.incidentType === 'period') {
    const ht = e.text === 'HT' || e.time === 45;
    const ft = e.text === 'FT' || e.time === 90;
    body = (
      <>
        <div className="feed-badge period-badge">{e.text === 'HT' ? 'HT' : e.text === 'FT' ? 'FT' : e.time === 45 ? 'HT' : 'FT'}</div>
        <div className="feed-info period-info">
          {ht ? 'Koniec pierwszej połowy' : ft ? 'Koniec meczu' : (e.text ?? 'Przerwa')}
          {score && <span className="period-score">{score}</span>}
        </div>
      </>
    );
  } else if (e.incidentType === 'injuryTime') {
    body = (
      <>
        <div className="feed-badge injurytime-badge"><i className="fa-regular fa-clock" /></div>
        <div className="feed-info injurytime-info">Sędzia dolicza: <strong>+{e.injuryTimeLength ?? e.addedTime ?? '?'} min</strong></div>
      </>
    );
  } else if (e.incidentType === 'varDecision') {
    body = (
      <div className="feed-card var-card">
        <div className="feed-icon"><i className="fa-solid fa-display var-icon" /></div>
        <div className="feed-details">
          <span className="player-name">{e.playerName}</span>
          <span className="var-label">
            VAR:{' '}
            {e.confirmed === true ? (
              <span className="var-confirmed"><i className="fa-solid fa-check" /> Potwierdzone</span>
            ) : e.confirmed === false ? (
              <span className="var-overturned"><i className="fa-solid fa-xmark" /> Odrzucone</span>
            ) : (
              <span className="var-pending">W trakcie analizy</span>
            )}
          </span>
          {label && <span className="sub-info">({label})</span>}
        </div>
      </div>
    );
  } else {
    const isCard = e.incidentType === 'card';
    const isSub = e.incidentType === 'substitution';
    const isPen = e.incidentType === 'inGamePenalty';
    body = (
      <div className="feed-card">
        <div className="feed-icon">
          {isGoal ? (
            <>
              <i className="fa-solid fa-futbol goal-icon" />
              {score && <span className="goal-score">{score}</span>}
            </>
          ) : isCard ? (
            e.cardColor === 'red' ? (
              <div className="card-icon red" />
            ) : e.cardColor === 'yellow-red' ? (
              <div className="card-icon-double"><div className="card-icon yellow card-overlap" /><div className="card-icon red card-overlap" /></div>
            ) : (
              <div className="card-icon yellow" />
            )
          ) : isSub ? (
            <i className="fa-solid fa-right-left sub-icon" />
          ) : isPen ? (
            <span className="penalty-icon"><i className="fa-solid fa-futbol" /></span>
          ) : (
            <i className="fa-solid fa-circle-info info-icon" />
          )}
        </div>
        <div className="feed-details">
          {isGoal ? (
            <>
              <span className="player-name">{e.playerName}{label && <span className="incident-tag">{label}</span>}</span>
              {e.assistPlayerName && <span className="sub-info"><i className="fa-solid fa-shoe-prints" style={{ fontSize: '0.7rem' }} /> {e.assistPlayerName}</span>}
              {e.assist2PlayerName && <span className="sub-info"><i className="fa-solid fa-shoe-prints" style={{ fontSize: '0.7rem' }} /> {e.assist2PlayerName}</span>}
            </>
          ) : isCard ? (
            <>
              <span className="player-name">{e.playerName}{e.rescinded && <span className="rescinded-tag">ANULOWANA</span>}</span>
              {e.reason && <span className="sub-info">{e.reason}</span>}
              {label && <span className="sub-info card-type-label">{label}</span>}
            </>
          ) : isSub ? (
            <>
              <span className="sub-detail"><i className="fa-solid fa-arrow-up" style={{ color: '#10b981' }} /> <span className="player-name">{e.playerInName || e.playerName || ''}</span></span>
              {e.playerOutName && (
                <span className="sub-detail">
                  <i className="fa-solid fa-arrow-down" style={{ color: '#ef4444' }} /> <span className="player-out">{e.playerOutName}</span>
                  {e.injury && <i className="fa-solid fa-kit-medical injury-badge" title="Kontuzja" />}
                </span>
              )}
            </>
          ) : isPen ? (
            <>
              <span className="player-name">
                {e.playerName}
                {e.incidentClass === 'missed' && <span className="rescinded-tag" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>Nietrafiony karny</span>}
                {e.incidentClass === 'awarded' && <span className="incident-tag">Karny przyznany</span>}
              </span>
              {e.reason === 'goalkeeperSave' ? <span className="sub-info"><i className="fa-solid fa-hands" /> Obrona bramkarza</span> : e.reason && <span className="sub-info">{e.reason}</span>}
            </>
          ) : (
            <>
              <span className="player-name">{e.playerName}</span>
              {e.text && <span className="sub-info">{e.text}</span>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`feed-row ${e.side}`}>
      <div className="feed-time">{timeLabel}</div>
      {body}
    </div>
  );
}

function PitchPlayer({ s, home }: { s: PitchSpot; home: boolean }) {
  const p = s.player;
  const name = firstWords(p.playerName);
  return (
    <div className={`pitch-player ${home ? 'home-player' : 'away-player'}`} style={{ '--p-top': `${s.top}%`, '--p-left': `${s.left}%` } as React.CSSProperties}>
      <div className={`pitch-player-circle${p.isCaptain ? ' captain-circle' : ''}`}>{p.shirtNumber ?? ''}</div>
      <div className="pitch-player-name">
        {p.playerApiId ? <Link href={`/player/${p.playerApiId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{name}</Link> : name}
      </div>
      {p.avgRating && <div className={`pitch-rating ${s.ratingClass}`}>{p.avgRating}</div>}
    </div>
  );
}

function SubsGrid({ title, players }: { title: string; players: LineupPlayer[] }) {
  return (
    <div className="subs-half">
      <div className="subs-title"><i className="fa-solid fa-arrow-right-arrow-left" /> {title}</div>
      <div className="subs-grid">
        {players.length === 0 && <p className="no-data">Brak danych.</p>}
        {players.map((p) => (
          <div key={p.id} className="sub-card">
            <span className="sub-num">{p.shirtNumber ?? '–'}</span>
            <span className="sub-name">
              {p.playerApiId ? <Link href={`/player/${p.playerApiId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.playerName}</Link> : p.playerName}
            </span>
            <span className="sub-pos">{POS_LABELS[p.position ?? ''] ?? p.position ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready, tier } = useAuth();
  const { isSubscribed, isPending, toggle } = useSubscriptions();
  const now = useNow(1000);
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
      <div className="vf-match">
        <div className="detail-wrapper">
          <Link href="/" className="back-btn-modern"><i className="fa-solid fa-chevron-left" /> Wróć do wyników</Link>
          <p className="no-data">{error.status === 404 ? 'Nie znaleziono meczu.' : error.message}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="vf-match">
        <div className="detail-wrapper"><p className="no-data"><i className="fa-solid fa-circle-notch fa-spin" /> Ładowanie meczu...</p></div>
      </div>
    );
  }

  const { match, events, access, lineups } = data;
  const subscribed = isSubscribed(match.id);
  const stats = data.stats ?? [];
  const activePeriod = stats[Math.min(period, Math.max(stats.length - 1, 0))];
  const spotsHome = data.pitchHome ?? [];
  const spotsAway = data.pitchAway ?? [];

  return (
    <div className="vf-match">
      <div className="detail-wrapper">
        <Link href="/" className="back-btn-modern"><i className="fa-solid fa-chevron-left" /> Wróć do wyników</Link>

        <div className="match-card-premium">
          <div className="scoreboard-header" style={{ position: 'relative' }}>
            {goalBanner && (
              <div className="anim-goal-pop" style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', padding: '6px 20px', borderRadius: 999, background: '#10b981', color: '#000', fontWeight: 800, boxShadow: '0 4px 20px rgba(16,185,129,0.4)', zIndex: 5 }}>⚽ GOL!</div>
            )}
            <div className="team-block"><span className="team-name-lg">{match.homeTeam?.name}</span></div>
            <div className="score-center">
              <div className={`main-score${goalBanner ? ' anim-score-bump' : ''}`} key={`${match.homeScore}-${match.awayScore}`}>{match.homeScore} - {match.awayScore}</div>
              <div className="status-badge">
                <span className="pulse-icon" />
                <span>{clockText(match, now)}</span>
              </div>
              <button
                className={`bell-btn${subscribed ? ' bell-active' : ''}`}
                style={{ margin: '10px auto 0' }}
                onClick={() => void toggle(match.id, match.apiId).catch(() => {})}
                disabled={isPending(match.id)}
                aria-pressed={subscribed}
                title={subscribed ? 'Wyłącz powiadomienia' : 'Włącz powiadomienia'}
              >
                <i className="fa-solid fa-bell" />
              </button>
            </div>
            <div className="team-block"><span className="team-name-lg">{match.awayTeam?.name}</span></div>
          </div>

          <div className="match-tabs">
            <button className={`tab-btn${tab === 'timeline' ? ' active' : ''}`} onClick={() => setTab('timeline')}>Oś czasu</button>
            <button className={`tab-btn${tab === 'lineups' ? ' active' : ''}`} onClick={() => setTab('lineups')}>Składy</button>
            <button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>Statystyki</button>
          </div>

          {/* OŚ CZASU */}
          <div className="tab-content" style={{ display: tab === 'timeline' ? 'block' : 'none' }}>
            <div className="timeline-container">
              {events.length === 0 ? <p className="no-data">Brak zdarzeń.</p> : events.map((e) => <FeedRow key={e.id} e={e} />)}
            </div>
          </div>

          {/* SKŁADY (PLUS) */}
          <div className="tab-content" style={{ display: tab === 'lineups' ? 'block' : 'none' }}>
            {access.lineups && lineups ? (
              <>
                <div className="pitch-container">
                  <div className="pitch-teams-header">
                    <div className="team-header-home">{match.homeTeam?.name}{match.homeFormation && <span className="formation-tag">{match.homeFormation}</span>}</div>
                    <div className="team-header-away">{match.awayFormation && <span className="formation-tag">{match.awayFormation}</span>}{match.awayTeam?.name}</div>
                  </div>
                  <div className="pitch-field">
                    <div className="pitch-half-line" />
                    <div className="pitch-center-circle" />
                    <div className="pitch-center-dot" />
                    <div className="pitch-penalty-box pitch-penalty-left" />
                    <div className="pitch-penalty-box pitch-penalty-right" />
                    <div className="pitch-goal-box pitch-goal-left" />
                    <div className="pitch-goal-box pitch-goal-right" />
                    <div className="pitch-corner pitch-corner-tl" />
                    <div className="pitch-corner pitch-corner-tr" />
                    <div className="pitch-corner pitch-corner-bl" />
                    <div className="pitch-corner pitch-corner-br" />
                    {spotsHome.map((s) => <PitchPlayer key={`h${s.player.id}`} s={s} home />)}
                    {spotsAway.map((s) => <PitchPlayer key={`a${s.player.id}`} s={s} home={false} />)}
                    {spotsHome.length === 0 && spotsAway.length === 0 && (
                      <div className="pitch-empty-state">
                        <div className="pitch-empty-icon"><i className="fa-solid fa-people-group" /></div>
                        <div className="pitch-empty-text">Składy na boisku niedostępne</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="subs-section">
                  <SubsGrid title={`Rezerwa – ${match.homeTeam?.name ?? ''}`} players={lineups.homeSubs} />
                  <SubsGrid title={`Rezerwa - ${match.awayTeam?.name ?? ''}`} players={lineups.awaySubs} />
                </div>

                {((data.missingHome?.length ?? 0) > 0 || (data.missingAway?.length ?? 0) > 0) && (
                  <div className="subs-section missing-section">
                    {[{ team: match.homeTeam?.name, list: data.missingHome ?? [] }, { team: match.awayTeam?.name, list: data.missingAway ?? [] }].map(({ team, list }, i) => (
                      <div className="subs-half" key={i}>
                        {list.length > 0 && (
                          <>
                            <div className="subs-title"><i className="fa-solid fa-user-injured" /> Kontuzje i Zawieszenia – {team}</div>
                            <div className="subs-grid">
                              {list.map((m) => (
                                <div key={m.id} className="sub-card missing-card">
                                  <span className="sub-num"><i className="fa-solid fa-ban" /></span>
                                  <span className="sub-name">{m.playerName}</span>
                                  <span className={`sub-pos status-${m.type}`}>{m.type.toUpperCase()}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="paywall-blur-wrapper">
                <div className="paywall-blur-content">
                  <div className="paywall-placeholder-rows">
                    <div className="paywall-placeholder-row" />
                    <div className="paywall-placeholder-row" style={{ opacity: 0.7, width: '80%' }} />
                    <div className="paywall-placeholder-row" style={{ opacity: 0.5, width: '90%' }} />
                    <div className="paywall-placeholder-row" style={{ opacity: 0.4, width: '70%' }} />
                    <div className="paywall-placeholder-row" style={{ opacity: 0.6, width: '85%' }} />
                    <div className="paywall-placeholder-row" style={{ opacity: 0.3, width: '75%' }} />
                  </div>
                </div>
                <div className="paywall-overlay">
                  <div className="paywall-overlay-box">
                    <div className="paywall-icon"><i className="fa-solid fa-lock" /></div>
                    <h3>Odblokuj składy i historię H2H</h3>
                    <p>Szczegółowe składy, rezerwowi, kontuzjowani gracze<br />oraz historia bezpośrednich spotkań &mdash; dostępne od planu <strong>PLUS</strong>.</p>
                    <Link href="/subscribe" className="paywall-upgrade-btn"><i className="fa-solid fa-arrow-up-right-from-square" /> Sprawdź cennik</Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STATYSTYKI (PREMIUM) */}
          <div className="tab-content" style={{ display: tab === 'stats' ? 'block' : 'none' }}>
            {access.stats ? (
              stats.length > 0 ? (
                <div className="stats-container">
                  <div className="stats-period-tabs">
                    {stats.map((p, i) => (
                      <button key={p.period} className={`period-btn${i === period ? ' active' : ''}`} onClick={() => setPeriod(i)}>
                        {p.period === 'ALL' ? 'Cały mecz' : p.period === '1ST' ? '1. połowa' : p.period === '2ND' ? '2. połowa' : p.period}
                      </button>
                    ))}
                  </div>
                  <div className="stats-period-panel">
                    {activePeriod?.items.map((it, i) => (
                      <div key={`${it.name}-${i}`} className={`stat-row${it.isPossession ? ' stat-highlight' : ''}`}>
                        <div className="stat-value stat-home-val">{it.home}</div>
                        <div className="stat-bar-wrapper">
                          <div className="stat-label">{it.name}</div>
                          <div className="stat-bar-dual">
                            <div className="stat-bar-home" style={{ width: `${it.homePct}%` }} />
                            <div className="stat-bar-away" style={{ width: `${it.awayPct}%` }} />
                          </div>
                        </div>
                        <div className="stat-value stat-away-val">{it.away}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="stats-empty"><i className="fa-solid fa-chart-bar" /> Statystyki niedostępne</div>
              )
            ) : (
              <div className="paywall-premium-banner">
                <div className="paywall-premium-crown"><i className="fa-solid fa-crown" /></div>
                <h3>Statystyki xG i zaawansowane dane</h3>
                <p>Oczekiwane bramki (xG), posiadanie piłki, strzały celne<br />i dziesiątki innych wskaźników &mdash; dostępne wyłącznie w planie <strong>PREMIUM</strong>.</p>
                <p className="paywall-premium-tagline">Wznieś swoje analizy na najwyższy poziom.</p>
                <Link href="/subscribe" className="paywall-upgrade-btn paywall-upgrade-premium"><i className="fa-solid fa-crown" /> Wybierz Premium</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
