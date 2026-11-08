import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { PlayersService, playerView } from '../players/players.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TierGuard } from '../common/guards/tier.guard.js';
import { RequireTier } from '../common/decorators/require-tier.decorator.js';

class SearchQueryDto {
  @IsString() @MinLength(2) @MaxLength(100) q!: string;
}

/** Globalna wyszukiwarka drużyn i zawodników — funkcja PLUS (soft paywall z paska nawigacji). */
@Controller('search')
@UseGuards(JwtAuthGuard, TierGuard)
@RequireTier('PLUS')
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly players: PlayersService,
  ) {}

  @Get()
  async search(@Query() { q }: SearchQueryDto) {
    const query = q.trim();
    const [teams, dbPlayers] = await Promise.all([
      this.prisma.team.findMany({ where: { name: { contains: query } }, take: 20, orderBy: { name: 'asc' } }),
      this.prisma.player.findMany({
        where: { name: { contains: query } },
        include: { team: true },
        take: 20,
        orderBy: { name: 'asc' },
      }),
    ]);

    let players = dbPlayers;
    if (players.length === 0) {
      // Fallback do API (Django search_players_from_api) — zapisuje podstawowe dane lokalnie
      const found = await this.sportApi.searchPlayers(query);
      const saved = [];
      for (const entity of found.slice(0, 20)) {
        const p = await this.players.upsertSearchResult(entity);
        if (p) saved.push(p);
      }
      players = saved;
    }

    return {
      query,
      teams: teams.map((t) => ({ id: t.id, apiId: t.apiId, name: t.name })),
      players: players.map(playerView),
    };
  }
}
