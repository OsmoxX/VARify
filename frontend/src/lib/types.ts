export type Tier = 'FREE' | 'PLUS' | 'PREMIUM';

export const TIER_LEVEL: Record<Tier, number> = { FREE: 0, PLUS: 1, PREMIUM: 2 };
export const hasAccess = (tier: Tier | null | undefined, required: Tier) =>
  (TIER_LEVEL[tier ?? 'FREE'] ?? 0) >= TIER_LEVEL[required];

export interface TeamRef {
  id: number;
  apiId: number;
  name: string;
}

export interface MatchSummary {
  id: number;
  apiId: number;
  league: { id: number; apiId: string; name: string; country: string | null } | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: number;
  periodStartMinute: number;
  matchTime: string | null;
  startDatetime: string | null;
  isTop: boolean;
}

export interface LeagueGroupData<T = MatchSummary> {
  leagueApiId: string;
  leagueName: string;
  country: string | null;
  isTop: boolean;
  matches: T[];
}

export interface Paginated<T> {
  count: number;
  page: number;
  pageSize: number;
  next: number | null;
  previous: number | null;
  results: T[];
}
