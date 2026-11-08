import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { EntitiesService } from '../entities/entities.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { num, obj, str } from '../common/utils/json.js';
import { unixToDate } from '../common/utils/timezone.js';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly entities: EntitiesService,
    private readonly lock: LockService,
  ) {}

  /**
   * "Zwiadowca": zapisuje ostatnie mecze drużyny (tylko podstawowe dane). Blokada 5 min jak
   * w Django. Nie nadpisuje meczów, które właśnie trwają (stan live ma pierwszeństwo).
   */
  async scoutLastMatches(teamApiId: number, n = 5): Promise<number> {
    if (!(await this.lock.acquire(`team-last-matches:${teamApiId}`, 5 * 60_000))) return 0;
    const events = await this.sportApi.fetchTeamLastMatches(teamApiId);
    if (!events) return 0;

    let saved = 0;
    for (const event of events.slice(-n)) {
      try {
        const apiId = num(event['id']);
        const tournament = obj(event['tournament']);
        const unique = obj(tournament['uniqueTournament']);
        const leagueApiId = str(unique['id']) ?? str(tournament['id']);
        const home = obj(event['homeTeam']);
        const away = obj(event['awayTeam']);
        const homeId = num(home['id']);
        const awayId = num(away['id']);
        if (apiId === null || !leagueApiId || homeId === null || awayId === null) continue;

        const existing = await this.prisma.liveMatch.findUnique({
          where: { apiId },
          select: { status: true },
        });
        if (
          existing &&
          !SportApiService.isEndedStatus(existing.status) &&
          !SportApiService.isNotStartedStatus(existing.status)
        ) {
          continue;
        }

        const country = str(obj(tournament['category'])['name']) ?? 'Other';
        const [leagueId, homeTeamId, awayTeamId] = await Promise.all([
          this.entities.ensureLeague(
            leagueApiId,
            str(unique['name']) ?? str(tournament['name']) ?? 'Unknown league',
            country,
          ),
          this.entities.ensureTeam(homeId, str(home['name']) ?? 'Home'),
          this.entities.ensureTeam(awayId, str(away['name']) ?? 'Away'),
        ]);
        const start = unixToDate(event['startTimestamp']);
        const data = {
          leagueId,
          homeTeamId,
          awayTeamId,
          homeScore: num(obj(event['homeScore'])['current']) ?? 0,
          awayScore: num(obj(event['awayScore'])['current']) ?? 0,
          status: (str(obj(event['status'])['description']) ?? 'Ended').slice(0, 50),
          startDatetime: start,
          matchDate: start ? new Date(start.toISOString().slice(0, 10)) : null,
          countryName: country.slice(0, 100),
        };
        await this.prisma.liveMatch.upsert({
          where: { apiId },
          create: { apiId, ...data },
          update: data,
        });
        saved++;
      } catch (err) {
        this.logger.warn(`scout skip ${str(event['id']) ?? '?'}: ${String(err)}`);
      }
    }
    return saved;
  }

  /** Ostatnie mecze drużyny + ewentualne dociągnięcie w tle (<5 meczów lub nieaktualne dane). */
  async recentMatches(teamId: number, teamApiId: number, skip: number, take: number) {
    const where = { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] };
    const [count, latest] = await Promise.all([
      this.prisma.liveMatch.count({ where }),
      this.prisma.liveMatch.findFirst({
        where,
        orderBy: [{ matchDate: 'desc' }, { id: 'desc' }],
        select: { matchDate: true },
      }),
    ]);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const stale = !latest?.matchDate || latest.matchDate < today;
    if (count < 5 || stale) {
      void this.scoutLastMatches(teamApiId).catch((err: unknown) =>
        this.logger.warn(`scout failed for ${teamApiId}: ${String(err)}`),
      );
    }
    const rows = await this.prisma.liveMatch.findMany({
      where,
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: [{ matchDate: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
    return { rows, count };
  }

  /** Czy drużyna występuje w jakimkolwiek meczu (filtr "drużyny piłkarskie"). */
  static readonly FOOTBALL_TEAM_FILTER = {
    OR: [
      { homeLiveMatches: { some: {} } },
      { awayLiveMatches: { some: {} } },
      { homeUpcomingMatches: { some: {} } },
      { awayUpcomingMatches: { some: {} } },
    ],
  };
}

