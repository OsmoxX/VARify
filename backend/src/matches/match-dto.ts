import type { Prisma } from '@prisma/client';
import { currentMatchMinute } from './domain/match-minute.js';

export const MATCH_INCLUDE = {
  league: true,
  homeTeam: true,
  awayTeam: true,
} satisfies Prisma.LiveMatchInclude;

export type MatchWithRelations = Prisma.LiveMatchGetPayload<{ include: typeof MATCH_INCLUDE }>;

const team = (t: { id: number; apiId: number; name: string } | null) =>
  t ? { id: t.id, apiId: t.apiId, name: t.name } : null;

/** Publiczny kształt meczu (bez pól wewnętrznych: notifiedEventIds, hasIncidentData…). */
export function toMatchSummary(m: MatchWithRelations, now: number = Date.now()) {
  return {
    id: m.id,
    apiId: m.apiId,
    league: m.league
      ? { id: m.league.id, apiId: m.league.apiId, name: m.league.name, country: m.league.country }
      : null,
    homeTeam: team(m.homeTeam),
    awayTeam: team(m.awayTeam),
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    /** Minuta obliczona w momencie odpowiedzi. */
    minute: currentMatchMinute(m, now),
    /** Dane do tykania zegara po stronie klienta: periodStartMinute + (now - matchTime)/60. */
    periodStartMinute: m.minute,
    matchTime: m.matchTime,
    startDatetime: m.startDatetime ? m.startDatetime.toISOString() : null,
    matchDate: m.matchDate ? m.matchDate.toISOString().slice(0, 10) : null,
    isTop: m.isTop,
    countryName: m.countryName,
  };
}

export type MatchSummary = ReturnType<typeof toMatchSummary>;
