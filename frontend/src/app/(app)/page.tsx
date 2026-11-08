'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { LeagueGroup } from '@/components/live/LeagueGroup';
import type { LeagueGroupData } from '@/lib/types';

interface LiveResponse {
  leagues: LeagueGroupData[];
  total: number;
}

/** Centrum wyników — układ i zachowanie jak `live_match_list.html` (filtr lig, „Rozwiń wszystkie”, top ligi + „Inne ligi”). */
export default function HomePage() {
  const { data, error, loading, reload } = useApi<LiveResponse>('/matches/live');
  const [filterOpen, setFilterOpen] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // ligi odznaczone w filtrze
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(true);
  const filterRef = useRef<HTMLDivElement>(null);

  // Odświeżanie co 60 s (wyniki w czasie rzeczywistym dostarcza WebSocket — to siatka bezpieczeństwa)
  useEffect(() => {
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filterOpen]);

  const leagues = useMemo(() => data?.leagues ?? [], [data]);
  const visibleInFilter = useMemo(() => {
    const q = leagueSearch.trim().toLowerCase();
    return leagues.filter((l) => !q || l.leagueName.toLowerCase().includes(q));
  }, [leagues, leagueSearch]);
  const shown = leagues.filter((l) => !hidden.has(l.leagueApiId));
  const top = shown.filter((l) => l.isTop);
  const other = shown.filter((l) => !l.isTop);

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderGroups = (list: LeagueGroupData[]) =>
    list.map((l) => <LeagueGroup key={l.leagueApiId} league={l} collapsed={collapsed.has(l.leagueApiId)} onToggle={() => toggleCollapsed(l.leagueApiId)} />);

  return (
    <>
      <div className="controls-wrapper">
        <div className="title-section">
          <h1 className="main-title">Mecze na żywo</h1>
          <span className="live-dot" />
        </div>

        <div className="actions-section">
          <div className="filter-wrapper" ref={filterRef}>
            <button className="filter-btn" onClick={() => setFilterOpen(!filterOpen)}>
              <i className="fa-solid fa-filter" /> Filtruj ligi
            </button>
            <div className="filter-menu" style={{ display: filterOpen ? 'block' : 'none' }}>
              <div className="filter-menu-header">
                <strong>Filtruj ligi</strong>
                <i className="fa-solid fa-xmark close-filter" onClick={() => setFilterOpen(false)} />
              </div>
              <div className="filter-search-box">
                <i className="fa-solid fa-magnifying-glass filter-search-icon" />
                <input type="text" placeholder="Szukaj ligi..." value={leagueSearch} onChange={(e) => setLeagueSearch(e.target.value)} autoComplete="off" />
              </div>
              <div className="filter-actions-bar">
                <button className="filter-select-btn" onClick={() => setHidden((p) => { const n = new Set(p); visibleInFilter.forEach((l) => n.delete(l.leagueApiId)); return n; })}>Zaznacz wszystkie</button>
                <button className="filter-select-btn" onClick={() => setHidden((p) => { const n = new Set(p); visibleInFilter.forEach((l) => n.add(l.leagueApiId)); return n; })}>Odznacz wszystkie</button>
              </div>
              <div className="filter-content">
                {visibleInFilter.map((l) => (
                  <label key={l.leagueApiId} className="checkbox-label league-filter-item">
                    <input type="checkbox" checked={!hidden.has(l.leagueApiId)} onChange={() => toggleHidden(l.leagueApiId)} />
                    <span className="league-filter-name">{l.leagueName}</span>
                  </label>
                ))}
              </div>
              {visibleInFilter.length === 0 && (
                <div className="filter-no-results"><i className="fa-solid fa-circle-exclamation" /> Nie znaleziono lig</div>
              )}
            </div>
          </div>

          <div className="global-toggle">
            <span className="toggle-text">Rozwiń wszystkie</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={expandAll}
                onChange={(e) => {
                  setExpandAll(e.target.checked);
                  setCollapsed(e.target.checked ? new Set() : new Set(leagues.map((l) => l.leagueApiId)));
                }}
              />
              <span className="slider" />
            </label>
          </div>
        </div>
      </div>

      <div className="leagues-container">
        {error && !data ? (
          <div className="empty-state">
            <i className="fa-solid fa-triangle-exclamation" />
            <p>Błąd ładowania meczów. {error.message}</p>
            <button className="filter-btn" style={{ margin: '12px auto 0' }} onClick={reload}>Spróbuj ponownie</button>
          </div>
        ) : loading && !data ? (
          <div className="empty-state">
            <i className="fa-solid fa-circle-notch fa-spin" />
            <p>Ładowanie meczów...</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-futbol" />
            <p>Brak meczów na żywo w tym momencie.</p>
          </div>
        ) : (
          <>
            {renderGroups(top)}
            {top.length > 0 && other.length > 0 && (
              <div className="other-leagues-divider"><span>Inne ligi</span></div>
            )}
            {renderGroups(other)}
          </>
        )}
      </div>
    </>
  );
}
