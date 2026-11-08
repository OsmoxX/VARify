'use client';

import '@/styles/match.css';
import '@/styles/team.css';
import '@/styles/league.css';
import Link from 'next/link';
import { use, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { MiniLogo } from '@/components/ui/MiniLogo';
import type { TeamRef } from '@/lib/types';

interface MatchRowData {
  id: number;
  apiId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  startDatetime: string | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
}
interface Standing {
  id: number;
  position: number;
  points: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  team: TeamRef;
}
interface LeagueResponse {
  league: { id: number; apiId: string; name: string; country: string | null };
  standings: Standing[];
  upcoming: MatchRowData[];
  recent: MatchRowData[];
}

const pad = (n: number) => String(n).padStart(2, '0');
function upcomingLabel(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; // czas lokalny użytkownika
}

/** Strona ligi — port `league_detail.html` (zakładki: Mecze / Tabela ligi). */
export default function LeaguePage({ params }: { params: Promise<{ apiId: string }> }) {
  const { apiId } = use(params);
  const { data, error, loading } = useApi<LeagueResponse>(`/leagues/${apiId}`);
  const [tab, setTab] = useState<'matches' | 'standings'>('matches');

  return (
    <div className="vf-match"><div className="vf-team"><div className="vf-league">
      <div className="detail-wrapper">
        <Link className="back-btn-modern" href="/"><i className="fa-solid fa-chevron-left" /> Powrót</Link>

        <div className="team-header">
          <div className="team-logo-placeholder"><i className="fa-solid fa-trophy" /></div>
          <div className="team-name-section">
            <h1>{data ? data.league.name : error ? 'Nieznana Liga' : 'Ładowanie...'}</h1>
            <div className="team-meta">{data ? (data.league.country ?? 'Świat') : error?.status === 404 ? 'Liga nie została jeszcze pobrana przez system.' : ''}</div>
          </div>
        </div>

        <div className="tabs-container">
          <button className={`tab-btn${tab === 'matches' ? ' active' : ''}`} onClick={() => setTab('matches')}><i className="fa-regular fa-calendar-days" /> Mecze</button>
          <button className={`tab-btn${tab === 'standings' ? ' active' : ''}`} onClick={() => setTab('standings')}><i className="fa-solid fa-list-ol" /> Tabela ligi</button>
        </div>

        {tab === 'matches' && (
          <div className="tab-content active" style={{ display: 'block' }}>
            {data && data.upcoming.length > 0 && (
              <div className="team-section">
                <h2><i className="fa-solid fa-calendar" /> Nadchodzące spotkania</h2>
                {data.upcoming.map((m) => (
                  <div key={m.id} className="team-match-row">
                    <div className="match-teams">
                      <span className="match-team-name home">{m.homeTeam?.name} <MiniLogo apiId={m.homeTeam?.apiId} /></span>
                      <span className="match-score-box upcoming-score">{upcomingLabel(m.startDatetime)}</span>
                      <span className="match-team-name away"><MiniLogo apiId={m.awayTeam?.apiId} /> {m.awayTeam?.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="team-section">
              <h2><i className="fa-solid fa-clock-rotate-left" /> Ostatnie wyniki</h2>
              {loading || !data ? (
                <div className="loading-state"><i className="fa-solid fa-circle-notch fa-spin" /></div>
              ) : data.recent.length === 0 ? (
                <div className="empty-state-small"><i className="fa-solid fa-circle-info" /> Brak rozegranych meczów na ten moment.</div>
              ) : (
                data.recent.map((m) => (
                  <Link key={m.id} href={`/match/${m.id}`} className="team-match-row">
                    <div className="match-teams">
                      <span className="match-team-name home">{m.homeTeam?.name} <MiniLogo apiId={m.homeTeam?.apiId} /></span>
                      <span className="match-score-box">{m.homeScore ?? 0} - {m.awayScore ?? 0}</span>
                      <span className="match-team-name away"><MiniLogo apiId={m.awayTeam?.apiId} /> {m.awayTeam?.name}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'standings' && (
          <div className="tab-content active" style={{ display: 'block' }}>
            <div className="team-section">
              <h2><i className="fa-solid fa-list-ol" /> Tabela ligowa</h2>
              <div className="table-container">
                <table className="standings-table">
                  <thead>
                    <tr>
                      <th className="col-pos">#</th><th className="col-team">Drużyna</th>
                      <th className="col-num" title="Mecze Rozegrane">M</th><th className="col-num" title="Wygrane">W</th><th className="col-num" title="Remisy">R</th><th className="col-num" title="Porażki">P</th>
                      <th className="col-num" title="Bramki">B+ / B-</th><th className="col-num" title="Różnica Bramek">+/-</th><th className="col-pts">Pkt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data ? (
                      <tr><td colSpan={9} className="empty-table"><i className="fa-solid fa-circle-notch fa-spin" /></td></tr>
                    ) : data.standings.length === 0 ? (
                      <tr><td colSpan={9} className="empty-table">Brak danych o tabeli (jeszcze nie pobrano).</td></tr>
                    ) : (
                      data.standings.map((r) => (
                        <tr key={r.id}>
                          <td className="col-pos">{r.position}</td>
                          <td className="col-team">
                            <Link href={`/team/${r.team.id}`} className="team-link"><MiniLogo apiId={r.team.apiId} /> {r.team.name}</Link>
                          </td>
                          <td className="col-num">{r.matchesPlayed}</td><td className="col-num">{r.matchesWon}</td><td className="col-num">{r.matchesDrawn}</td><td className="col-num">{r.matchesLost}</td>
                          <td className="col-num">{r.goalsFor}:{r.goalsAgainst}</td>
                          <td className="col-num">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                          <td className="col-pts">{r.points}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div></div></div>
  );
}
