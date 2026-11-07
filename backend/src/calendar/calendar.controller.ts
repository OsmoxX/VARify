import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
  ) {}

  /**
   * GET /api/calendar?date=2026-11-07
   * Odpowiednik Django calendar_views.py
   * Zwraca nadchodzące mecze dla podanej daty (lub dziś).
   */
  @Get()
  async getCalendar(@Query('date') dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const dateOnly = targetDate.toISOString().split('T')[0]!;

    // Check DB for cached data
    const startOfDay = new Date(dateOnly + 'T00:00:00Z');
    const endOfDay = new Date(dateOnly + 'T23:59:59Z');

    const cachedCount = await this.prisma.upcomingMatch.count({
      where: {
        startDatetime: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (cachedCount === 0) {
      // Fetch from API and cache
      const data = await this.sportApi.fetchScheduledEvents(dateOnly);
      if (data && Array.isArray(data['events'])) {
        await this.syncUpcomingMatches(data['events'] as Record<string, unknown>[]);
      }
    }

    const matches = await this.prisma.upcomingMatch.findMany({
      where: {
        startDatetime: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
      },
      orderBy: { startDatetime: 'asc' },
    });

    // Group by league
    const leagueMap = new Map<string, {
      leagueName: string;
      isTop: boolean;
      matches: typeof matches;
    }>();

    for (const match of matches) {
      const key = match.league?.apiId ?? 'unknown';
      if (!leagueMap.has(key)) {
        leagueMap.set(key, {
          leagueName: match.league?.name ?? 'Unknown',
          isTop: match.isTop,
          matches: [],
        });
      }
      leagueMap.get(key)!.matches.push(match);
    }

    return {
      date: dateOnly,
      leagues: [...leagueMap.values()].sort((a, b) => {
        if (a.isTop && !b.isTop) return -1;
        if (!a.isTop && b.isTop) return 1;
        return a.leagueName.localeCompare(b.leagueName);
      }),
      total: matches.length,
    };
  }

  private async syncUpcomingMatches(events: Record<string, unknown>[]) {
    for (const event of events) {
      try {
        const leagueData = event['tournament'] as Record<string, unknown>;
        const uniqueTournament = (leagueData['uniqueTournament'] as Record<string, unknown>) ?? {};
        const leagueApiId = String(uniqueTournament['id'] ?? leagueData['id']);
        const leagueName = (uniqueTournament['name'] ?? leagueData['name']) as string;

        const league = await this.prisma.league.upsert({
          where: { apiId: leagueApiId },
          create: { apiId: leagueApiId, name: leagueName },
          update: { name: leagueName },
        });

        const homeData = event['homeTeam'] as Record<string, unknown>;
        const awayData = event['awayTeam'] as Record<string, unknown>;

        const homeTeam = await this.prisma.team.upsert({
          where: { apiId: homeData['id'] as number },
          create: { apiId: homeData['id'] as number, name: homeData['name'] as string },
          update: {},
        });
        const awayTeam = await this.prisma.team.upsert({
          where: { apiId: awayData['id'] as number },
          create: { apiId: awayData['id'] as number, name: awayData['name'] as string },
          update: {},
        });

        // FIX BUG #3: UTC timestamp, nie +2h
        const startTs = event['startTimestamp'] as number | null;
        const startDatetime = startTs ? new Date(startTs * 1000) : null;

        const isTop = SportApiService.TOP_LEAGUE_IDS.has(leagueApiId);

        await this.prisma.upcomingMatch.upsert({
          where: { apiId: event['id'] as number },
          create: {
            apiId: event['id'] as number,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            leagueId: league.id,
            startDatetime,
            isTop,
          },
          update: { startDatetime, isTop },
        });
      } catch {
        // skip individual errors
      }
    }
  }
}
