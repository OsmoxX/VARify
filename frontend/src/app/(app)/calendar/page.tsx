'use client';

import '@/styles/calendar.css';
import { useMemo, useState } from 'react';
import { useApi, useMounted } from '@/lib/hooks';
import { formatLocalTime, localDateStr, userTimeZone } from '@/lib/time';
import { LeagueControls } from '@/components/live/LeagueControls';
import type { LeagueGroupData, TeamRef } from '@/lib/types';

interface Upcoming {
  id: number;
  apiId: number;
  startDatetime: string | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
}
interface CalendarResponse {
  date: string;
  tz: string;
  leagues: LeagueGroupData<Upcoming>[];
  total: number;
}

const DAY_NAMES = ['Ndz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

/** Nadchodzące mecze — port `calendar.html` + `calendar.js` (pasek 5 dni, filtr lig, godziny w strefie użytkownika). */
export default function CalendarPage() {
  const mounted = useMounted();
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(true);

  // 5 dni od „dziś” w strefie użytkownika (nie UTC — toISOString przesuwał dzień po północy)
  const days = useMemo(() => {
    if (!mounted) return [];
    const base = new Date();
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return {
        dateStr: localDateStr(d),
        name: i === 0 ? 'Dziś' : i === 1 ? 'Jutro' : DAY_NAMES[d.getDay()]!,
        date: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      };
    });
  }, [mounted]);

  const date = selected ?? days[0]?.dateStr ?? null;
  const tz = mounted ? userTimeZone() : 'UTC';
  const { data, loading, error, reload } = useApi<CalendarResponse>(date ? `/calendar?date=${date}&tz=${encodeURIComponent(tz)}` : null);

  const leagues = data?.leagues ?? [];
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

  const section = (l: LeagueGroupData<Upcoming>) => (
    <div key={l.leagueApiId} className={`league-section${l.isTop ? ' top-league' : ''}${collapsed.has(l.leagueApiId) ? ' collapsed' : ''}`}>
      <div className="league-header" onClick={() => toggleCollapsed(l.leagueApiId)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapsed(l.leagueApiId)}>
        <div className="league-info">
          {l.isTop ? <i className="fa-solid fa-star league-icon" style={{ color: 'var(--accent)' }} /> : <i className="fa-solid fa-trophy league-icon" />}
          <span className="league-title">{l.leagueName}</span>
          {l.country && <span className="country-tag">• {l.country}</span>}
        </div>
        <i className="fa-solid fa-chevron-down chevron-icon" />
      </div>
      <div className="league-matches">
        {l.matches.map((m) => (
          <div key={m.id} className="match-row upcoming-match-row">
            <div className="team team-home">{m.homeTeam?.name}</div>
            <div className="score-container">
              <div className="kickoff-time"><i className="fa-regular fa-clock" /> {formatLocalTime(m.startDatetime)}</div>
            </div>
            <div className="team team-away">{m.awayTeam?.name}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="vf-calendar">
      <LeagueControls
        title="Nadchodzące mecze"
        titleExtra={<i className="fa-solid fa-calendar-days calendar-icon-title" />}
        leagues={leagues.map((l) => ({ id: l.leagueApiId, name: l.leagueName }))}
        hidden={hidden}
        onHiddenChange={setHidden}
        expandAll={expandAll}
        onExpandAllChange={(v) => {
          setExpandAll(v);
          setCollapsed(v ? new Set() : new Set(leagues.map((l) => l.leagueApiId)));
        }}
      />

      <div className="day-picker">
        {days.map((d) => (
          <button key={d.dateStr} className={`day-picker-btn${d.dateStr === date ? ' active' : ''}`} onClick={() => setSelected(d.dateStr)}>
            <span className="day-name">{d.name}</span>
            <span className="day-date">{d.date}</span>
          </button>
        ))}
      </div>

      <div className="calendar-container">
        {error ? (
          <div className="empty-state">
            <i className="fa-solid fa-triangle-exclamation" />
            <p>Błąd ładowania meczów. {error.message}</p>
            <button className="filter-btn" style={{ margin: '12px auto 0' }} onClick={reload}>Spróbuj ponownie</button>
          </div>
        ) : loading || !data ? (
          <div className="empty-state"><i className="fa-solid fa-circle-notch fa-spin" /><p>Ładowanie meczów...</p></div>
        ) : shown.length === 0 ? (
          <div className="empty-state"><i className="fa-solid fa-calendar-xmark" /><p>Brak nadchodzących meczów na ten dzień.</p></div>
        ) : (
          <>
            {top.map(section)}
            {top.length > 0 && other.length > 0 && <div className="other-leagues-divider"><span>Inne ligi</span></div>}
            {other.map(section)}
          </>
        )}
      </div>
    </div>
  );
}
