import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
  ) {}

  /** GET /api/teams/search?q=Barcelona */
  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.length < 2) return { teams: [] };
    const teams = await this.prisma.team.findMany({
      where: { name: { contains: q } },
      take: 30,
      orderBy: { name: 'asc' },
    });
    return { teams };
  }

  /** GET /api/teams/:id */
  @Get(':id')
  async getTeam(@Param('id', ParseIntPipe) id: number) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        standings: {
          include: { league: true },
          orderBy: { position: 'asc' },
        },
        players: { orderBy: { jerseyNumber: 'asc' } },
      },
    });
    if (!team) return { error: 'Team not found' };

    // Fetch standings from API if not cached (or stale > 1h)
    const latestStanding = team.standings[0];
    const isStale = latestStanding
      ? Date.now() - latestStanding.updatedAt.getTime() > 3600_000
      : true;

    if (isStale) {
      const data = await this.sportApi.fetchTeamStandings(team.apiId);
      if (data) {
        await this.syncStandings(id, data);
        // Reload
        const refreshed = await this.prisma.team.findUnique({
          where: { id },
          include: {
            standings: { include: { league: true }, orderBy: { position: 'asc' } },
            players: { orderBy: { jerseyNumber: 'asc' } },
          },
        });
        return { team: refreshed };
      }
    }

    return { team };
  }

  private async syncStandings(teamId: number, data: Record<string, unknown>) {
    const standingsArray = Array.isArray(data['standings'])
      ? data['standings']
      : (data['tournamentTeamStatistics'] as unknown[]) ?? [];

    for (const standing of standingsArray as Record<string, unknown>[]) {
      const rows = (standing['rows'] as Record<string, unknown>[]) ?? [];
      for (const row of rows) {
        const teamData = row['team'] as Record<string, unknown>;
        if (!teamData) continue;

        const tournamentData = standing['tournament'] as Record<string, unknown>;
        const leagueApiId = String(tournamentData?.['id'] ?? '');
        if (!leagueApiId) continue;

        let league = await this.prisma.league.findUnique({ where: { apiId: leagueApiId } });
        if (!league) {
          league = await this.prisma.league.create({
            data: { apiId: leagueApiId, name: (tournamentData?.['name'] as string) ?? 'Unknown' },
          });
        }

        await this.prisma.leagueStandings.upsert({
          where: { id: 0 }, // force create; real upsert below
          create: {
            leagueId: league.id,
            teamId,
            position: (row['position'] as number) ?? 0,
            points: (row['points'] as number) ?? 0,
            matchesPlayed: (row['matches'] as number) ?? 0,
            matchesWon: (row['wins'] as number) ?? 0,
            matchesDrawn: (row['draws'] as number) ?? 0,
            matchesLost: (row['losses'] as number) ?? 0,
            goalsFor: (row['scoresFor'] as number) ?? 0,
            goalsAgainst: (row['scoresAgainst'] as number) ?? 0,
            goalDifference: ((row['scoresFor'] as number) ?? 0) - ((row['scoresAgainst'] as number) ?? 0),
          },
          update: {},
        }).catch(async () => {
          // Update existing
          const existing = await this.prisma.leagueStandings.findFirst({
            where: { leagueId: league!.id, teamId },
          });
          if (existing) {
            await this.prisma.leagueStandings.update({
              where: { id: existing.id },
              data: {
                position: (row['position'] as number) ?? 0,
                points: (row['points'] as number) ?? 0,
                matchesPlayed: (row['matches'] as number) ?? 0,
                matchesWon: (row['wins'] as number) ?? 0,
                matchesDrawn: (row['draws'] as number) ?? 0,
                matchesLost: (row['losses'] as number) ?? 0,
                goalsFor: (row['scoresFor'] as number) ?? 0,
                goalsAgainst: (row['scoresAgainst'] as number) ?? 0,
                goalDifference: ((row['scoresFor'] as number) ?? 0) - ((row['scoresAgainst'] as number) ?? 0),
              },
            });
          }
        });
      }
    }
  }
}
