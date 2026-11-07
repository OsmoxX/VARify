import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';

@Controller('players')
export class PlayersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
  ) {}

  /** GET /api/players/search?q=Messi */
  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.length < 2) return { players: [] };
    const results = await this.sportApi.searchPlayers(q);
    return { players: results ?? [] };
  }

  /** GET /api/players/:id */
  @Get(':id')
  async getPlayer(@Param('id', ParseIntPipe) id: number) {
    // Check DB first
    let player = await this.prisma.player.findUnique({
      where: { apiId: id },
      include: { team: true },
    });

    if (!player) {
      // Fetch from API and cache
      const data = await this.sportApi.fetchPlayer(id);
      if (!data) return { error: 'Player not found' };
      const pd = (data['player'] as Record<string, unknown>) ?? data;
      const teamData = pd['team'] as Record<string, unknown> | null;

      let teamId: number | null = null;
      if (teamData?.['id']) {
        const team = await this.prisma.team.upsert({
          where: { apiId: teamData['id'] as number },
          create: { apiId: teamData['id'] as number, name: teamData['name'] as string },
          update: {},
        });
        teamId = team.id;
      }

      player = await this.prisma.player.upsert({
        where: { apiId: id },
        create: {
          apiId: id,
          name: (pd['name'] as string) ?? 'Unknown',
          firstName: pd['firstName'] as string | null,
          lastName: pd['lastName'] as string | null,
          teamId,
          position: pd['position'] as string | null,
          jerseyNumber: pd['jerseyNumber'] as number | null,
          nationality: (pd['nationality'] as Record<string, unknown>)?.['name'] as string | null,
          height: pd['height'] as number | null,
          weight: pd['weight'] as number | null,
          preferredFoot: pd['preferredFoot'] as string | null,
          marketValue: pd['proposedMarketValue'] as bigint | null,
          retired: (pd['retired'] as boolean) ?? false,
        },
        update: {},
        include: { team: true },
      });
    }

    return { player };
  }
}
