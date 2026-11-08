import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { isUniqueViolation } from '../entities/entities.service.js';
import { TeamsService } from '../teams/teams.service.js';

class FavSearchDto {
  @IsString() @MaxLength(100) q!: string;
}
class MuteDto {
  @IsBoolean() isActive!: boolean;
}

/** Ulubione drużyny (Django: favorite_teams_list, toggle_favorite_team) — wymaga logowania, plan FREE. */
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/favorites */
  @Get()
  async list(@CurrentUser() user: AuthUser | null) {
    const rows = await this.prisma.favoriteTeam.findMany({
      where: { userId: user!.id },
      include: { team: true },
      orderBy: { team: { name: 'asc' } },
    });
    return {
      favorites: rows.map((f) => ({
        id: f.team.id,
        apiId: f.team.apiId,
        name: f.team.name,
        isActive: f.isActive,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  /** GET /api/favorites/search?q= — tylko drużyny piłkarskie (mające mecze w bazie) */
  @Get('search')
  async search(@CurrentUser() user: AuthUser | null, @Query() { q }: FavSearchDto) {
    const query = q.trim();
    if (query.length < 2) return { teams: [] };
    const [teams, favs] = await Promise.all([
      this.prisma.team.findMany({
        where: { name: { contains: query }, ...TeamsService.FOOTBALL_TEAM_FILTER },
        orderBy: { name: 'asc' },
        take: 30,
      }),
      this.prisma.favoriteTeam.findMany({ where: { userId: user!.id }, select: { teamId: true } }),
    ]);
    const favIds = new Set(favs.map((f) => f.teamId));
    return {
      teams: teams.map((t) => ({ id: t.id, apiId: t.apiId, name: t.name, isFavorite: favIds.has(t.id) })),
    };
  }

  /**
   * POST /api/favorites/:teamId/toggle
   * Create-first: równoległe kliknięcia nie tworzą duplikatów (unikalny userId+teamId),
   * a przegrany wyścig po prostu usuwa wpis.
   */
  @Post(':teamId/toggle')
  @HttpCode(200)
  async toggle(@CurrentUser() user: AuthUser | null, @Param('teamId', ParseIntPipe) teamId: number) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
    if (!team) throw new NotFoundException('Team not found');
    try {
      await this.prisma.favoriteTeam.create({ data: { userId: user!.id, teamId } });
      return { isFavorite: true, teamName: team.name };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await this.prisma.favoriteTeam.deleteMany({ where: { userId: user!.id, teamId } });
      return { isFavorite: false, teamName: team.name };
    }
  }

  /** PATCH /api/favorites/:teamId — wyciszenie/wznowienie powiadomień drużyny (is_active) */
  @Patch(':teamId')
  async setActive(
    @CurrentUser() user: AuthUser | null,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: MuteDto,
  ) {
    const { count } = await this.prisma.favoriteTeam.updateMany({
      where: { userId: user!.id, teamId },
      data: { isActive: dto.isActive },
    });
    if (count === 0) throw new NotFoundException('Not a favorite team');
    return { teamId, isActive: dto.isActive };
  }
}
