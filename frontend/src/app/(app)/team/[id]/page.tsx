'use client';

import '@/styles/match.css';
import '@/styles/team.css';
import '@/styles/league.css';
import '@/styles/favorites.css';
import Link from 'next/link';
import { use, useState } from 'react';
import { api, teamLogoUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { hasAccess, type Paginated, type TeamRef } from '@/lib/types';
import { MiniLogo } from '@/components/ui/MiniLogo';
import { PaywallBlur } from '@/components/ui/PaywallBlur';

interface TeamResponse {
  team: TeamRef;
  isFavorite: boolean;
  league: { apiId: string; name: string } | null;
  standings: Array<{ position: number; points: number; matchesPlayed: number; matchesWon: number; matchesDrawn: number; matchesLost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; team: TeamRef; isCurrent: boolean }>;
}
interface RecentMatch {
  id: number;
  homeScore: number;
  awayScore: number;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
  league: { apiId: string; name: string } | null;
}
interface LineupPlayer {
  id: number;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  isHomeTeam: boolean;
  isStartingXi: boolean;
  isCaptain: boolean;
  avgRating: string | null;
}

/** Strona drużyny — port `team_detail.html` (PLUS). */
export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, tier, ready } = useAuth();
  const allowed = ready && !!user && hasAccess(tier, 'PLUS');
  const { data, error, loading } = useApi<TeamResponse>(allowed ? `/teams/${id}` : null);
  const [page, setPage] = useState(1);
  const matches = useApi<Paginated<RecentMatch>>(data ? `/teams/${id}/matches?page=1` : null);
  const more = useApi<Paginated<RecentMatch>>(data && page > 1 ? `/teams/${id}/matches?page=${page}` : null);
  const [extra, setExtra] = useState<RecentMatch[]>([]);
  const [addedPages, setAddedPages] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<'matches' | 'standings'>('matches');
  const [fav, setFav] = useState<{ id: string; value: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const first = matches.data?.results[0];
  const squadSource = first && data ? { matchId: first.id, isHome: first.homeTeam?.id === data.team.id } : null;
  const squad = useApi<{ results: LineupPlayer[] }>(squadSource ? `/matches/${squadSource.matchId}/lineups` : null);

  // dołączanie kolejnych stron wyników (bez synchronicznego setState w efekcie)
  if (more.data && !addedPages.has(page)) {
    setAddedPages(new Set(addedPages).add(page));
    setExtra((e) => [...e, ...more.data!.results]);
  }

  if (!ready) return <div className="vf-match"><div className="detail-wrapper"><p className="no-data"><i className="fa-solid fa-circle-notch fa-spin" /></p></div></div>;
  if (!allowed) {
    return (
      <div className="detail-wrapper">
        <PaywallBlur title="Strony drużyn są w planie PLUS">Składy, tabela ligi i historia ostatnich meczów &mdash; dostępne od planu <strong>PLUS</strong>.</PaywallBlur>
      </div>
    );
  }

  const isFavorite = fav?.id === id ? fav.value : data?.isFavorite ?? false;
  const toggleFav = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ isFavorite: boolean }>(`/favorites/${data.team.id}/toggle`);
      setFav({ id, value: res.isFavorite });
    } finally {
      setBusy(false);
    }
  };

  const allMatches = [...(matches.data?.results ?? []), ...extra];
  const next = (more.data ?? matches.data)?.next ?? null;
  const squadRows = (squad.data?.results ?? []).filter((p) => squadSource && p.isHomeTeam === squadSource.isHome);
  const teamId = data?.team.id;

  return (
    <div className="vf-match"><div className="vf-team"><div className="vf-league">
      <div className="detail-wrapper">
        <Link className="back-btn-modern" href="/"><i className="fa-solid fa-chevron-left" /> Powrót</Link>

        <div className="team-header">
          {data && !logoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="team-logo" src={teamLogoUrl(data.team.apiId)} alt={data.team.name} onError={() => setLogoFailed(true)} />
          ) : (
            <div className="team-logo-placeholder"><i className="fa-solid fa-shield-halved" /></div>
          )}
          <div className="team-name-section">
            <div className="team-name-row">
              <h1>{data ? data.team.name : error ? (error.status === 404 ? 'Nie znaleziono drużyny' : 'Błąd') : 'Ładowanie...'}</h1>
              {data && (
                <button className={`toggle-favorite-btn${isFavorite ? ' is-favorite' : ''}`} onClick={() => void toggleFav()} disabled={busy} aria-label={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'} title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
                  <i className={`${isFavorite ? 'fa-solid' : 'fa-regular'} fa-star`} />
                </button>
              )}
            </div>
            <div className="team-meta">{data?.league ? <Link href={`/league/${data.league.apiId}`} style={{ color: 'inherit' }}>{data.league.name}</Link> : ''}</div>
          </div>
        </div>

        <div className="tabs-container">
          <button className={`tab-btn${tab === 'matches' ? ' active' : ''}`} onClick={() => setTab('matches')}><i className="fa-regular fa-calendar-days" /> Mecze</button>
          <button className={`tab-btn${tab === 'standings' ? ' active' : ''}`} onClick={() => setTab('standings')}><i className="fa-solid fa-list-ol" /> Tabela ligi</button>
        </div>

        {tab === 'matches' && (
          <div className="tab-content active" style={{ display: 'block' }}>
            <div className="team-section">
              <h2><i className="fa-solid fa-clock-rotate-left" /> Ostatnie mecze</h2>
              {loading || matches.loading ? (
                <div className="loading-state"><i className="fa-solid fa-circle-notch fa-spin" /></div>
              ) : allMatches.length === 0 ? (
                <div className="empty-state-small"><i className="fa-solid fa-circle-info" /> Brak meczów w bazie danych.</div>
              ) : (
                <>
                  {allMatches.map((m) => (
                    <Link key={m.id} href={`/match/${m.id}`} className="team-match-row">
                      <div className="match-teams">
                        <span className={`match-team-name home ${m.homeTeam?.id === teamId ? 'highlight' : ''}`}>{m.homeTeam?.name} <MiniLogo apiId={m.homeTeam?.apiId} /></span>
                        <span className="match-score-box">{m.homeScore} - {m.awayScore}</span>
                        <span className={`match-team-name away ${m.awayTeam?.id === teamId ? 'highlight' : ''}`}><MiniLogo apiId={m.awayTeam?.apiId} /> {m.awayTeam?.name}</span>
                      </div>
                      {m.league && <span className="match-league-tag">{m.league.name}</span>}
                    </Link>
                  ))}
                  {next && <button className="btn-load-more" onClick={() => setPage(next)}>Pokaż więcej meczów</button>}
                </>
              )}
            </div>

            {squadRows.length > 0 && first && (
              <div className="team-section">
                <h2><i className="fa-solid fa-users" /> Skład (z meczu: {first.homeTeam?.name} vs {first.awayTeam?.name})</h2>
                <div className="squad-grid">
                  {squadRows.map((p) => (
                    <div key={p.id} className="squad-player">
                      <div className="squad-number">{p.shirtNumber ?? '–'}</div>
                      <div className="squad-player-info">
                        <div className="squad-player-name">{p.playerName} {p.isCaptain && <span className="captain-badge">C</span>}</div>
                        <div className="squad-player-meta">
                          {p.position && <span className="pos-tag">{p.position}</span>} {!p.isStartingXi && <span className="sub-badge">Rezerwowy</span>} {p.avgRating ? `⭐ ${p.avgRating}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'standings' && (
          <div className="tab-content active" style={{ display: 'block' }}>
            <div className="team-section">
              <h2><i className="fa-solid fa-list-ol" /> Tabela ligowa <span>{data?.league?.name}</span></h2>
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
                        <tr key={r.team.id} className={r.isCurrent ? 'highlight-row' : ''}>
                          <td className="col-pos">{r.position}</td>
                          <td className="col-team"><Link href={`/team/${r.team.id}`} className="team-link"><MiniLogo apiId={r.team.apiId} /> {r.team.name}</Link></td>
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
