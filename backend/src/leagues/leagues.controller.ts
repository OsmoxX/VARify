import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { StandingsService } from './standings.service.js';
import { pageParams, paginated } from '../common/utils/pagination.js';
import { SportApiService } from '../sport-api/sport-api.service.js';

class LeaguesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
class ApiIdParams {
  @Matches(/^\d{1,10}$/) apiId!: string;
}

const standingView = (s: {
  id: number;
  position: number;
  points: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  team: { id: number; apiId: number; name: string };
}) => ({
  id: s.id,
  position: s.position,
  points: s.points,
  matchesPlayed: s.matchesPlayed,
  matchesWon: s.matchesWon,
  matchesDrawn: s.matchesDrawn,
  matchesLost: s.matchesLost,
  goalsFor: s.goalsFor,
  goalsAgainst: s.goalsAgainst,
  goalDifference: s.goalDifference,
  team: { id: s.team.id, apiId: s.team.apiId, name: s.team.name },
});

const matchView = (m: {
  id: number;
  apiId: number;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  startDatetime: Date | null;
  homeTeam: { id: number; apiId: number; name: string } | null;
  awayTeam: { id: number; apiId: number; name: string } | null;
}) => ({
  id: m.id,
  apiId: m.apiId,
  homeScore: m.homeScore ?? null,
  awayScore: m.awayScore ?? null,
  status: m.status ?? null,
  startDatetime: m.startDatetime?.toISOString() ?? null,
  homeTeam: m.homeTeam && { id: m.homeTeam.id, apiId: m.homeTeam.apiId, name: m.homeTeam.name },
  awayTeam: m.awayTeam && { id: m.awayTeam.id, apiId: m.awayTeam.apiId, name: m.awayTeam.name },
});

const FINISHED = ['ended', 'finished', 'after extra time', 'after penalties'];

@Controller('leagues')
export class LeaguesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly standings: StandingsService,
  ) {}

  /** GET /api/leagues?search=&page= */
  @Get()
  async list(@Query() q: LeaguesQueryDto) {
    const { page, skip, take } = pageParams(q.page);
    const where = q.search
      ? { OR: [{ name: { contains: q.search } }, { country: { contains: q.search } }] }
      : {};
    const [rows, count] = await Promise.all([
      this.prisma.league.findMany({ where, orderBy: { id: 'asc' }, skip, take }),
      this.prisma.league.count({ where }),
    ]);
    return paginated(rows, count, page);
  }

  /** GET /api/leagues/:apiId — strona ligi: tabela + najbliższe + ostatnie mecze */
  @Get(':apiId')
  async detail(@Param() { apiId }: ApiIdParams) {
    const league = await this.prisma.league.findUnique({ where: { apiId } });
    if (!league) throw new NotFoundException('League not found');

    let table = await this.prisma.leagueStandings.findMany({
      where: { leagueId: league.id },
      include: { team: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    if (table.length === 0 && SportApiService.isTopLeague(apiId)) {
      await this.standings.ensureLeagueStandings(apiId);
      table = await this.prisma.leagueStandings.findMany({
        where: { leagueId: league.id },
        include: { team: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
    }

    const [upcoming, recent] = await Promise.all([
      this.prisma.upcomingMatch.findMany({
        where: { leagueId: league.id, startDatetime: { gte: new Date(Date.now() - 3 * 3600_000) } },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { startDatetime: 'asc' },
        take: 10,
      }),
      this.prisma.liveMatch.findMany({
        where: { leagueId: league.id, status: { in: FINISHED } },
        include: { homeTeam: true, awayTeam: true },
        orderBy: [{ matchDate: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ]);

    return {
      league,
      standings: table.map(standingView),
      upcoming: upcoming.map(matchView),
      recent: recent.map(matchView),
    };
  }

  /** GET /api/leagues/:apiId/standings?page= */
  @Get(':apiId/standings')
  async standingsPage(@Param() { apiId }: ApiIdParams, @Query() q: PageDto) {
    const { page, skip, take } = pageParams(q.page);
    const where = { league: { apiId } };
    const [rows, count] = await Promise.all([
      this.prisma.leagueStandings.findMany({
        where,
        include: { team: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.leagueStandings.count({ where }),
    ]);
    return paginated(rows.map(standingView), count, page);
  }
}
