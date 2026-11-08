'use client';

import '@/styles/favorites.css';
import Link from 'next/link';
import { useState } from 'react';
import { api, teamLogoUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';

interface Fav {
  id: number;
  apiId: number;
  name: string;
}
interface SearchTeam extends Fav {
  isFavorite: boolean;
}

/** Herb z proxy backendu; przy błędzie — tarcza jak w Django (`.fav-*-logo-fallback`). */
function Logo({ apiId, name, kind }: { apiId: number; name: string; kind: 'team' | 'result' }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`fav-${kind}-logo-fallback`} style={{ display: 'flex' }}>
        <i className="fa-solid fa-shield-halved" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`fav-${kind === 'team' ? 'team' : 'result'}-logo`} src={teamLogoUrl(apiId)} alt={name} onError={() => setFailed(true)} />;
}

/** Moje ulubione drużyny — port `favorite_teams.html`. */
export default function FavoritesPage() {
  const { user, ready } = useAuth();
  const { data, reload } = useApi<{ favorites: Fav[] }>(user ? '/favorites' : null);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState<{ q: string; teams: SearchTeam[] } | null>(null);
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  if (!ready) return <div className="vf-favorites"><div className="fav-empty-state"><i className="fa-solid fa-circle-notch fa-spin empty-icon" /></div></div>;
  if (!user) {
    return (
      <div className="vf-favorites">
        <div className="fav-empty-state" style={{ display: 'block' }}>
          <i className="fa-regular fa-star empty-icon" />
          <h3>Zaloguj się, aby zobaczyć ulubione drużyny</h3>
          <p>Śledź swoje kluby i dostawaj powiadomienia, gdy grają.</p>
          <Link href="/login?next=/favorites" className="fav-search-btn" style={{ display: 'inline-flex', marginTop: 12, textDecoration: 'none' }}>
            <i className="fa-solid fa-right-to-bracket" /> Zaloguj się
          </Link>
        </div>
      </div>
    );
  }

  const favorites = data?.favorites ?? [];

  const toggle = async (team: Fav, fromSearch: boolean) => {
    if (busy.has(team.id)) return; // jedno żądanie na drużynę naraz
    setBusy((b) => new Set(b).add(team.id));
    setMessage(null);
    try {
      const res = await api.post<{ isFavorite: boolean }>(`/favorites/${team.id}/toggle`);
      if (!res.isFavorite && !fromSearch) setRemoving((r) => new Set(r).add(team.id)); // animacja `.removing`, potem odświeżenie
      else reload();
      setSearched((s) => s && { ...s, teams: s.teams.map((t) => (t.id === team.id ? { ...t, isFavorite: res.isFavorite } : t)) });
      if (!res.isFavorite && fromSearch) reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Nie udało się zapisać zmiany');
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(team.id);
        return n;
      });
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const res = await api.get<{ teams: SearchTeam[] }>(`/favorites/search?q=${encodeURIComponent(q)}`);
      setSearched({ q, teams: res.teams });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Wyszukiwanie nie powiodło się');
    }
  };

  return (
    <div className="vf-favorites">
      <div className="fav-page-header">
        <div className="header-icon"><i className="fa-solid fa-star" /></div>
        <h1>
          Moje ulubione drużyny
          <span className="fav-count-badge">{favorites.length}</span>
        </h1>
      </div>

      {message && <p className="fav-results-count" style={{ color: '#f87171' }} role="alert">{message}</p>}

      <section className="fav-section">
        <h2 className="fav-section-title"><i className="fa-solid fa-shield-halved" /> Zapisane drużyny</h2>
        {favorites.length > 0 ? (
          <div className="fav-teams-grid">
            {favorites.map((f) => (
              <div
                key={f.id}
                className={`fav-team-card${removing.has(f.id) ? ' removing' : ''}`}
                onAnimationEnd={() => {
                  if (removing.has(f.id)) {
                    setRemoving((r) => {
                      const n = new Set(r);
                      n.delete(f.id);
                      return n;
                    });
                    reload();
                  }
                }}
              >
                <Logo apiId={f.apiId} name={f.name} kind="team" />
                <div className="fav-team-info">
                  <Link href={`/team/${f.id}`} className="fav-team-name" title={f.name}>{f.name}</Link>
                </div>
                <button className="toggle-favorite-btn is-favorite" onClick={() => void toggle(f, false)} disabled={busy.has(f.id)} aria-label="Usuń z ulubionych" title="Usuń z ulubionych">
                  <i className="fa-solid fa-star" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="fav-empty-state" style={{ display: 'block' }}>
            <i className="fa-regular fa-star empty-icon" />
            <h3>Nie masz jeszcze ulubionych drużyn</h3>
            <p>Wyszukaj drużynę poniżej lub kliknij gwiazdkę na stronie drużyny, aby ją dodać.</p>
          </div>
        )}
      </section>

      <section className="fav-section">
        <h2 className="fav-section-title">
          <i className="fa-solid fa-magnifying-glass" /> Dodaj nową drużynę
          {searched && (
            <button className="fav-clear-search-btn" onClick={() => { setSearched(null); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              Wyczyść wyszukiwanie
            </button>
          )}
        </h2>
        <form onSubmit={search} className="fav-search-form">
          <div className="fav-search-wrapper">
            <i className="fa-solid fa-magnifying-glass" />
            <input type="text" className="fav-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Wpisz nazwę drużyny..." autoComplete="off" />
          </div>
          <button type="submit" className="fav-search-btn"><i className="fa-solid fa-search" /> Szukaj</button>
        </form>

        {searched && (
          <>
            <p className="fav-results-count">
              {searched.teams.length > 0 ? <>Znaleziono <strong>{searched.teams.length}</strong> wyników dla „{searched.q}”</> : <>Brak wyników dla „{searched.q}”</>}
            </p>
            <div className="fav-search-results">
              {searched.teams.map((t) => (
                <div key={t.id} className="fav-search-result-item">
                  <Logo apiId={t.apiId} name={t.name} kind="result" />
                  <Link href={`/team/${t.id}`} className="fav-result-name" title={t.name}>{t.name}</Link>
                  <button className={`toggle-favorite-btn${t.isFavorite ? ' is-favorite' : ''}`} onClick={() => void toggle(t, true)} disabled={busy.has(t.id)} aria-label={t.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'} title={t.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
                    <i className={`${t.isFavorite ? 'fa-solid' : 'fa-regular'} fa-star`} />
                  </button>
                </div>
              ))}
              {searched.teams.length === 0 && (
                <div className="fav-empty-state" style={{ display: 'block' }}>
                  <i className="fa-solid fa-circle-exclamation empty-icon" />
                  <h3>Nie znaleziono drużyn</h3>
                  <p>Spróbuj innej frazy wyszukiwania.</p>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
