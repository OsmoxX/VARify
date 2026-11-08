import { SportApiService } from '../../sport-api/sport-api.service.js';

export interface LeagueRef {
  apiId: string;
  name: string;
  country: string | null;
}

export interface LeagueGroup<T> {
  leagueApiId: string;
  leagueName: string;
  country: string | null;
  isTop: boolean;
  matches: T[];
}

const TOP_ORDER = [...SportApiService.TOP_LEAGUE_IDS];

/**
 * Grupuje mecze po lidze; ligi TOP (w kolejności z listy), potem reszta alfabetycznie
 * (odpowiednik Django _build_league_groups + TOP_LEAGUES_CONFIG). `isTop` wynika z ligi,
 * nie z pierwszego meczu w grupie.
 */
export function groupByLeague<T extends { league: LeagueRef | null }>(
  matches: T[],
): LeagueGroup<T>[] {
  const map = new Map<string, LeagueGroup<T>>();
  for (const m of matches) {
    const key = m.league?.apiId ?? 'unknown';
    let g = map.get(key);
    if (!g) {
      g = {
        leagueApiId: key,
        leagueName: m.league?.name ?? 'Unknown League',
        country: m.league?.country ?? null,
        isTop: SportApiService.isTopLeague(key),
        matches: [],
      };
      map.set(key, g);
    }
    g.matches.push(m);
  }
  const rank = (g: LeagueGroup<T>) => {
    const i = TOP_ORDER.indexOf(g.leagueApiId);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return [...map.values()].sort((a, b) => {
    if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
    if (a.isTop && b.isTop) return rank(a) - rank(b);
    return a.leagueName.localeCompare(b.leagueName);
  });
}
