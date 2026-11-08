import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TeamsService } from './teams.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TierGuard } from '../common/guards/tier.guard.js';
import { RequireTier } from '../common/decorators/require-tier.decorator.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../common/dto/pagination.dto.js';
import { pageParams, paginated } from '../common/utils/pagination.js';

const teamView = (t: { id: number; apiId: number; name: string; logoUrl?: string | null }) => ({
  id: t.id,
  apiId: t.apiId,
  name: t.name,
});

/**
 * Strona drużyny wymaga planu PLUS (Django @require_tier(PLUS) na team_detail_view).
 * W Django samo API było otwarte, więc paywall dawało się obejść — tu egzekwujemy go
 * na wszystkich endpointach drużyny.
 */
@Controller('teams')
@UseGuards(JwtAuthGuard, TierGuard)
@RequireTier('PLUS')
export class TeamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
  ) {}

  /** GET /api/teams?search=&page= */
  @Get()
  async list(@Query() q: PageQueryDto) {
    const { page, skip, take } = pageParams(q.page);
    const where = q.search ? { name: { contains: q.search } } : {};
    const [rows, count] = await Promise.all([
      this.prisma.team.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take }),
      this.prisma.team.count({ where }),
    ]);
    return paginated(rows.map(teamView), count, page);
  }

  /** GET /api/teams/:id (lokalne id) — strona drużyny */
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser | null) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        standings: { include: { league: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        players: { orderBy: [{ jerseyNumber: 'asc' }, { name: 'asc' }], take: 60 },
      },
    });
    if (!team) throw new NotFoundException('Team not found');

    const [fav, table] = await Promise.all([
      this.prisma.favoriteTeam.findUnique({
        where: { userId_teamId: { userId: user!.id, teamId: id } },
        select: { id: true },
      }),
      team.standings[0]
        ? this.prisma.leagueStandings.findMany({
            where: { leagueId: team.standings[0].leagueId },
            include: { team: true },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    return {
      team: teamView(team),
      isFavorite: !!fav,
      league: team.standings[0]?.league ?? null,
      standings: table.map((s) => ({
        position: s.position,
        points: s.points,
        matchesPlayed: s.matchesPlayed,
        matchesWon: s.matchesWon,
        matchesDrawn: s.matchesDrawn,
        matchesLost: s.matchesLost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        team: teamView(s.team),
        isCurrent: s.teamId === id,
      })),
      players: team.players.map((p) => ({
        id: p.id,
        apiId: p.apiId,
        name: p.name,
        position: p.position,
        jerseyNumber: p.jerseyNumber,
      })),
    };
  }

  /** GET /api/teams/:id/standings?page= — pełna tabela ligi drużyny */
  @Get(':id/standings')
  async standings(@Param('id', ParseIntPipe) id: number, @Query() q: PageQueryDto) {
    const first = await this.prisma.leagueStandings.findFirst({
      where: { teamId: id },
      orderBy: { updatedAt: 'desc' },
      select: { leagueId: true },
    });
    if (!first) throw new NotFoundException('No standings for this team');
    const { page, skip, take } = pageParams(q.page);
    const where = { leagueId: first.leagueId };
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
    return paginated(
      rows.map((s) => ({ ...s, team: teamView(s.team), teamId: undefined, leagueId: undefined })),
      count,
      page,
    );
  }

  /** GET /api/teams/:id/matches?page= — ostatnie mecze (z dociąganiem w tle) */
  @Get(':id/matches')
  async matches(@Param('id', ParseIntPipe) id: number, @Query() q: PageQueryDto) {
    const team = await this.prisma.team.findUnique({ where: { id }, select: { id: true, apiId: true } });
    if (!team) throw new NotFoundException('Team not found');
    const { page, skip, take } = pageParams(q.page);
    const { rows, count } = await this.teams.recentMatches(team.id, team.apiId, skip, take);
    return paginated(
      rows.map((m) => ({
        id: m.id,
        apiId: m.apiId,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        matchDate: m.matchDate?.toISOString().slice(0, 10) ?? null,
        startDatetime: m.startDatetime?.toISOString() ?? null,
        league: m.league && { apiId: m.league.apiId, name: m.league.name },
        homeTeam: m.homeTeam && teamView(m.homeTeam),
        awayTeam: m.awayTeam && teamView(m.awayTeam),
      })),
      count,
      page,
    );
  }
}
