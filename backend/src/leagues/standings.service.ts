import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { EntitiesService } from '../entities/entities.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { arr, num, obj, str } from '../common/utils/json.js';

@Injectable()
export class StandingsService {
  private readonly logger = new Logger(StandingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly entities: EntitiesService,
    private readonly lock: LockService,
  ) {}

  /** Port Django fetch_league_standings: sezon → tabela → upsert po (liga, drużyna). */
  async syncLeague(tournamentId: string): Promise<number> {
    const seasonId = await this.sportApi.fetchCurrentSeasonId(tournamentId);
    if (!seasonId) return 0;
    const standings = await this.sportApi.fetchLeagueStandings(tournamentId, seasonId);
    if (!standings || standings.length === 0) return 0;

    const tournament = obj(standings[0]?.['tournament']);
    const leagueId = await this.entities.ensureLeague(
      tournamentId,
      str(tournament['name']) ?? `League ${tournamentId}`,
      str(obj(tournament['category'])['name']),
    );

    let rows = 0;
    for (const group of standings) {
      for (const row of arr(group['rows'])) {
        const team = obj(row['team']);
        const teamApiId = num(team['id']);
        if (teamApiId === null) continue;
        const teamId = await this.entities.ensureTeam(teamApiId, str(team['name']) ?? 'Unknown');
        const gf = num(row['scoresFor']) ?? 0;
        const ga = num(row['scoresAgainst']) ?? 0;
        const data = {
          position: num(row['position']) ?? 0,
          points: num(row['points']) ?? 0,
          matchesPlayed: num(row['matches']) ?? 0,
          matchesWon: num(row['wins']) ?? 0,
          matchesDrawn: num(row['draws']) ?? 0,
          matchesLost: num(row['losses']) ?? 0,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDifference: gf - ga,
        };
        await this.prisma.leagueStandings.upsert({
          where: { leagueId_teamId: { leagueId, teamId } },
          create: { leagueId, teamId, ...data },
          update: data,
        });
        rows++;
      }
    }
    return rows;
  }

  /** Codziennie dla lig TOP; błąd jednej ligi nie zatrzymuje reszty. */
  async syncTopLeagues(): Promise<number> {
    const token = await this.lock.acquire('standings-sync', 30 * 60_000);
    if (!token) return 0;
    try {
      let ok = 0;
      for (const id of SportApiService.STANDINGS_LEAGUE_IDS) {
        try {
          if ((await this.syncLeague(id)) > 0) ok++;
        } catch (err) {
          this.logger.warn(`standings ${id} failed: ${String(err)}`);
        }
      }
      return ok;
    } finally {
      await this.lock.release('standings-sync', token);
    }
  }

  /** Na żądanie, gdy liga nie ma jeszcze tabeli (throttling 10 min). */
  async ensureLeagueStandings(tournamentId: string): Promise<void> {
    if (!(await this.lock.acquire(`standings-on-demand:${tournamentId}`, 10 * 60_000))) return;
    try {
      await this.syncLeague(tournamentId);
    } catch (err) {
      this.logger.warn(`on-demand standings ${tournamentId} failed: ${String(err)}`);
    }
  }
}
