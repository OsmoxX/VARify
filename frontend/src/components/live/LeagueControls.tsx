'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface FilterLeague {
  id: string;
  name: string;
}

/**
 * Nagłówek z tytułem, filtrem lig i przełącznikiem „Rozwiń wszystkie” — wspólny dla listy live i kalendarza
 * (w Django ten sam markup `.controls-wrapper` + `live_match_list.css`).
 */
export function LeagueControls({
  title,
  titleExtra,
  leagues,
  hidden,
  onHiddenChange,
  expandAll,
  onExpandAllChange,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  leagues: FilterLeague[];
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  expandAll: boolean;
  onExpandAllChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leagues.filter((l) => !q || l.name.toLowerCase().includes(q));
  }, [leagues, search]);

  const toggle = (id: string) => {
    const n = new Set(hidden);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onHiddenChange(n);
  };
  const setAll = (checked: boolean) => {
    const n = new Set(hidden);
    visible.forEach((l) => (checked ? n.delete(l.id) : n.add(l.id)));
    onHiddenChange(n);
  };

  return (
    <div className="controls-wrapper">
      <div className="title-section">
        <h1 className="main-title">{title}</h1>
        {titleExtra}
      </div>

      <div className="actions-section">
        <div className="filter-wrapper" ref={ref}>
          <button className="filter-btn" onClick={() => setOpen(!open)}>
            <i className="fa-solid fa-filter" /> Filtruj ligi
          </button>
          <div className="filter-menu" style={{ display: open ? 'block' : 'none' }}>
            <div className="filter-menu-header">
              <strong>Filtruj ligi</strong>
              <i className="fa-solid fa-xmark close-filter" onClick={() => setOpen(false)} />
            </div>
            <div className="filter-search-box">
              <i className="fa-solid fa-magnifying-glass filter-search-icon" />
              <input type="text" placeholder="Szukaj ligi..." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
            <div className="filter-actions-bar">
              <button className="filter-select-btn" onClick={() => setAll(true)}>Zaznacz wszystkie</button>
              <button className="filter-select-btn" onClick={() => setAll(false)}>Odznacz wszystkie</button>
            </div>
            <div className="filter-content">
              {visible.map((l) => (
                <label key={l.id} className="checkbox-label league-filter-item">
                  <input type="checkbox" checked={!hidden.has(l.id)} onChange={() => toggle(l.id)} />
                  <span className="league-filter-name">{l.name}</span>
                </label>
              ))}
            </div>
            {visible.length === 0 && (
              <div className="filter-no-results"><i className="fa-solid fa-circle-exclamation" /> Nie znaleziono lig</div>
            )}
          </div>
        </div>

        <div className="global-toggle">
          <span className="toggle-text">Rozwiń wszystkie</span>
          <label className="switch">
            <input type="checkbox" checked={expandAll} onChange={(e) => onExpandAllChange(e.target.checked)} />
            <span className="slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
