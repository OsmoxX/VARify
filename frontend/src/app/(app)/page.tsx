'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { LeagueGroup } from '@/components/live/LeagueGroup';
import { LeagueControls } from '@/components/live/LeagueControls';
import type { LeagueGroupData } from '@/lib/types';

interface LiveResponse {
  leagues: LeagueGroupData[];
  total: number;
}

/** Centrum wyników — układ i zachowanie jak `live_match_list.html` (filtr lig, „Rozwiń wszystkie”, top ligi + „Inne ligi”). */
export default function HomePage() {
  const { data, error, loading, reload } = useApi<LiveResponse>('/matches/live');
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // ligi odznaczone w filtrze
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(true);

  // Odświeżanie co 60 s (wyniki w czasie rzeczywistym dostarcza WebSocket — to siatka bezpieczeństwa)
  useEffect(() => {
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  const leagues = useMemo(() => data?.leagues ?? [], [data]);
  const shown = leagues.filter((l) => !hidden.has(l.leagueApiId));
  const top = shown.filter((l) => l.isTop);
  const other = shown.filter((l) => !l.isTop);

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
      <LeagueControls
        title="Mecze na żywo"
        titleExtra={<span className="live-dot" />}
        leagues={leagues.map((l) => ({ id: l.leagueApiId, name: l.leagueName }))}
        hidden={hidden}
        onHiddenChange={setHidden}
        expandAll={expandAll}
        onExpandAllChange={(v) => {
          setExpandAll(v);
          setCollapsed(v ? new Set() : new Set(leagues.map((l) => l.leagueApiId)));
        }}
      />

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
