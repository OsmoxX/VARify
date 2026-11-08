'use client';

import '@/styles/player.css';
import '@/styles/search.css';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { hasAccess } from '@/lib/types';
import { PaywallBlur } from '@/components/ui/PaywallBlur';

interface SearchResponse {
  query: string;
  teams: Array<{ id: number; apiId: number; name: string }>;
  players: Array<{ apiId: number; name: string; firstName: string | null; lastName: string | null; position: string | null }>;
}

/** Wyniki wyszukiwania — port `search_results.html` (PLUS). */
export default function SearchPage() {
  const router = useRouter();
  const q = (useSearchParams().get('q') ?? '').trim();
  const { tier, ready } = useAuth();
  const allowed = ready && hasAccess(tier, 'PLUS');
  const { data, loading, error } = useApi<SearchResponse>(allowed && q.length >= 2 ? `/search?q=${encodeURIComponent(q)}` : null);

  if (ready && !allowed) {
    return (
      <div className="detail-wrapper">
        <PaywallBlur title="Wyszukiwarka klubów wymaga planu PLUS">Znajdź dowolną drużynę lub zawodnika &mdash; dostępne od planu <strong>PLUS</strong>.</PaywallBlur>
      </div>
    );
  }

  return (
    <div className="vf-search">
      <div className="calendar-container search-container">
        <div className="header-section search-header">
          <h1 className="page-title"><i className="fa-solid fa-magnifying-glass" /> {q ? `Wyniki dla: "${q}"` : 'Wyniki wyszukiwania'}</h1>
          <a className="back-btn-modern" onClick={() => router.back()} role="button" tabIndex={0} style={{ cursor: 'pointer' }}><i className="fa-solid fa-arrow-left" /> Wróć</a>
        </div>

        <div>
          {q.length < 2 ? (
            <p className="search-empty-state">Wpisz co najmniej 2 znaki w pasku wyszukiwania.</p>
          ) : error ? (
            <p className="search-empty-state">Błąd wyszukiwania. Spróbuj ponownie.</p>
          ) : loading || !data ? (
            <div className="loading-state"><i className="fa-solid fa-circle-notch fa-spin" /><p>Wyszukiwanie...</p></div>
          ) : (
            <>
              <h2 className="search-section-title">Drużyny</h2>
              {data.teams.length > 0 ? (
                <div className="search-results-list">
                  {data.teams.map((t) => (
                    <Link key={t.id} href={`/team/${t.id}`} className="search-result-card">
                      <div className="search-result-image-wrapper"><i className="fa-solid fa-shield-halved team-fallback" style={{ color: 'var(--text-muted)', fontSize: '2rem', display: 'block' }} /></div>
                      <span className="search-result-name">{t.name}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="search-empty-state">Brak drużyn pasujących do zapytania.</p>
              )}

              <h2 className="search-section-title">Zawodnicy</h2>
              {data.players.length > 0 ? (
                <div className="search-results-list">
                  {data.players.map((p) => (
                    <Link key={p.apiId} href={`/player/${p.apiId}`} className="search-result-card">
                      <div className="search-result-image-wrapper player-wrapper"><i className="fa-solid fa-user player-fallback" style={{ color: 'var(--text-muted)', fontSize: '1.5rem', display: 'block' }} /></div>
                      <div className="search-result-info">
                        <div className="search-result-name">{p.firstName || p.lastName ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : p.name}</div>
                        {p.position && <div className="search-result-subtitle">{p.position}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="search-empty-state">Brak zawodników pasujących do zapytania.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
