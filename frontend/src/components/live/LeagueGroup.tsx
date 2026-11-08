'use client';

import { MatchRow } from './MatchRow';
import type { LeagueGroupData } from '@/lib/types';

export type { LeagueGroupData };

/** Sekcja ligi w układzie Django (`.league-section`, gwiazdka dla top lig, zwijana). */
export function LeagueGroup({ league, collapsed, onToggle }: { league: LeagueGroupData; collapsed: boolean; onToggle: () => void }) {
  return (
    <div className={`league-section${league.isTop ? ' top-league' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="league-header" onClick={onToggle} role="button" aria-expanded={!collapsed} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}>
        <div className="league-info">
          {league.isTop ? <i className="fa-solid fa-star league-icon top-icon" /> : <i className="fa-solid fa-trophy league-icon" />}
          <span className="league-title">{league.leagueName}</span>
          {league.country && <span className="country-tag">• {league.country}</span>}
        </div>
        <i className="fa-solid fa-chevron-down chevron-icon" />
      </div>
      <div className="league-matches">
        {league.matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}
