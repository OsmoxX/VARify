import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { MatchesGateway } from './matches.gateway.js';
import { LiveMatch, Prisma } from '@prisma/client';

type ApiEvent = Record<string, unknown>;

/**
 * MatchesService
 *
 * Odpowiednik Django: matches/services/match_service.py
 * Zawiera poprawki logiczne (BUG #1, #2, #3).
 */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly gateway: MatchesGateway,
  ) {}

  // ===========================================================================
  //  INCIDENT MAPPERS  (odpowiednik Django _map_* functions)
  // ===========================================================================

  private safeNested(
    data: ApiEvent,
    ...keys: string[]
  ): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = data;
    for (const key of keys) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[key];
    }
    return cur ?? null;
  }

  private mapIncident(item: ApiEvent): Prisma.MatchEventCreateInput & { matchId?: number } {
    const iType = (item['incidentType'] as string) ?? '';
    const base = {
      incidentType: iType,
      eventId: String(item['id'] ?? ''),
      time: (item['time'] as number) ?? 0,
      addedTime: (item['addedTime'] as number) ?? 0,
      isHome: item['isHome'] !== false,
      match: { connect: { id: 0 } }, // placeholder, overridden in caller
    };

    switch (iType) {
      case 'goal': {
        const player = this.safeNested(item, 'player', 'name') as string | null;
        return {
          ...base,
          playerName: player ?? (item['playerName'] as string) ?? '',
          assistPlayerName:
            (this.safeNested(item, 'assist1', 'name') as string | null) ??
            (item['assist1Name'] as string | null),
          assist2PlayerName:
            (this.safeNested(item, 'assist2', 'name') as string | null) ??
            (item['assist2Name'] as string | null),
          homeScore: item['homeScore'] as number | null,
          awayScore: item['awayScore'] as number | null,
          incidentClass: item['incidentClass'] as string | null,
        };
      }
      case 'card':
        return {
          ...base,
          playerName:
            (this.safeNested(item, 'player', 'name') as string | null) ??
            (item['playerName'] as string) ?? '',
          incidentClass: item['incidentClass'] as string | null,
          reason: item['reason'] as string | null,
          rescinded: (item['rescinded'] as boolean) ?? false,
        };
      case 'substitution': {
        const pIn = (item['playerIn'] as ApiEvent) ?? {};
        const pOut = (item['playerOut'] as ApiEvent) ?? {};
        return {
          ...base,
          playerInName:
            (pIn['name'] as string | null) ??
            (item['playerNameIn'] as string) ?? '',
          playerOutName:
            (pOut['name'] as string | null) ??
            (item['playerNameOut'] as string) ?? '',
          playerName:
            (pIn['name'] as string | null) ??
            (item['playerNameIn'] as string) ?? '',
          injury: (item['injury'] as boolean) ?? false,
        };
      }
      case 'period':
        return {
          ...base,
          text: item['text'] as string | null,
          homeScore: item['homeScore'] as number | null,
          awayScore: item['awayScore'] as number | null,
          isLive: (item['isLive'] as boolean) ?? false,
        };
      case 'injuryTime':
        return { ...base, injuryTimeLength: item['length'] as number | null };
      case 'varDecision':
      case 'inGamePenalty':
        return {
          ...base,
          playerName:
            (this.safeNested(item, 'player', 'name') as string | null) ??
            (item['playerName'] as string) ?? '',
          incidentClass: item['incidentClass'] as string | null,
          reason: item['reason'] as string | null,
          confirmed: item['confirmed'] as boolean | null,
        };
      default:
        return base;
    }
  }

  // ===========================================================================
  //  SYNC LIVE MATCHES
  // ===========================================================================

  /**
   * Synchronizuje mecze live z API → DB.
   * Zwraca listę api_id meczów, w których nastąpiła zmiana.
   * Odpowiednik Django sync_live_matches() — z FIX BUG #3 (timezone).
   */
  async syncLiveMatches(): Promise<number[]> {
    const data = await this.sportApi.fetchLiveMatches();
    if (!data || !Array.isArray(data['events'])) {
      this.logger.warn('syncLiveMatches: no data from API');
      return [];
    }

    const changedApiIds: number[] = [];

    for (const event of data['events'] as ApiEvent[]) {
      try {
        const changedId = await this.upsertMatch(event);
        if (changedId !== null) changedApiIds.push(changedId);
      } catch (err) {
        this.logger.error(
          `Error processing event ${event['id']}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `syncLiveMatches: processed ${(data['events'] as ApiEvent[]).length} events, ${changedApiIds.length} changed`,
    );
    return changedApiIds;
  }

  /**
   * Upsert jednego meczu z API do DB.
   * Zwraca api_id jeśli wynik/status się zmienił, null w przeciwnym razie.
   * FIX BUG #3: timestamp → Date używa UTC (bez hardkodowanego +2h).
   */
  private async upsertMatch(event: ApiEvent): Promise<number | null> {
    const leagueData = event['tournament'] as ApiEvent;
    const uniqueTournament = (leagueData['uniqueTournament'] as ApiEvent) ?? {};
    const leagueApiId = String(
      uniqueTournament['id'] ?? (leagueData['id'] as number),
    );
    const leagueName =
      (uniqueTournament['name'] as string) ?? (leagueData['name'] as string);
    const category = (leagueData['category'] as ApiEvent) ?? {};
    const countryName = (category['name'] as string) ?? 'Other';

    // Upsert League
    const league = await this.prisma.league.upsert({
      where: { apiId: leagueApiId },
      create: { apiId: leagueApiId, name: leagueName, country: countryName },
      update: { name: leagueName, country: countryName },
    });

    const homeData = event['homeTeam'] as ApiEvent;
    const awayData = event['awayTeam'] as ApiEvent;

    // Upsert Teams
    const homeTeam = await this.prisma.team.upsert({
      where: { apiId: homeData['id'] as number },
      create: { apiId: homeData['id'] as number, name: homeData['name'] as string },
      update: { name: homeData['name'] as string },
    });
    const awayTeam = await this.prisma.team.upsert({
      where: { apiId: awayData['id'] as number },
      create: { apiId: awayData['id'] as number, name: awayData['name'] as string },
      update: { name: awayData['name'] as string },
    });

    const statusData = (event['status'] as ApiEvent) ?? {};
    const statusDesc = (statusData['description'] as string) ?? '';
    const startTs = event['startTimestamp'] as number | null;

    // FIX BUG #3: UTC timestamp → Date (bez hardkodowanego +2h)
    const matchDate = startTs ? new Date(startTs * 1000) : null;

    const timeData =
      typeof event['time'] === 'object' && event['time'] !== null
        ? (event['time'] as ApiEvent)
        : {};

    const periodStartTs = timeData['currentPeriodStartTimestamp'] as
      | number
      | null;
    const initialMin =
      Math.floor(((timeData['initial'] as number) ?? 0) / 60);

    const matchTime = periodStartTs ? String(periodStartTs) : null;
    const minute = periodStartTs ? initialMin : 0;

    const homeScore =
      ((event['homeScore'] as ApiEvent)?.['current'] as number) ?? 0;
    const awayScore =
      ((event['awayScore'] as ApiEvent)?.['current'] as number) ?? 0;
    const isTop = SportApiService.TOP_LEAGUE_IDS.has(leagueApiId);

    // Check for existing match to detect changes
    const existing = await this.prisma.liveMatch.findUnique({
      where: { apiId: event['id'] as number },
    });

    const scoreChanged = existing
      ? existing.homeScore < homeScore || existing.awayScore < awayScore
      : false;
    const statusChanged = existing
      ? existing.status !== statusDesc && !!statusDesc
      : false;

    // WebSocket: score update
    if (existing && scoreChanged) {
      this.gateway.broadcastScoreUpdate(event['id'] as number, {
        homeScore,
        awayScore,
        status: statusDesc,
      });
    }

    // WebSocket: status update
    if (existing && statusChanged && !scoreChanged) {
      this.gateway.broadcastStatusUpdate(event['id'] as number, {
        status: statusDesc,
      });
    }

    const matchData = {
      leagueId: league.id,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore,
      awayScore,
      status: statusDesc,
      minute,
      matchTime,
      matchDate,
      countryName,
      isTop,
    };

    await this.prisma.liveMatch.upsert({
      where: { apiId: event['id'] as number },
      create: { apiId: event['id'] as number, ...matchData },
      update: matchData,
    });

    if (scoreChanged || statusChanged) {
      return event['id'] as number;
    }
    return null;
  }

  // ===========================================================================
  //  FETCH MATCH DETAILS (lineups, events, stats)
  // ===========================================================================

  /**
   * Pobiera szczegóły meczu z API: zdarzenia, składy, statystyki.
   * FIX BUG #2: Ta metoda jest wywoływana przez job kolejkowy (BullMQ),
   * NIE blokuje worker HTTP.
   */
  async fetchMatchDetails(
    localMatchId: number,
    apiMatchId: number,
  ): Promise<void> {
    this.logger.log(
      `fetchMatchDetails: local=${localMatchId} api=${apiMatchId}`,
    );

    const [incidentsData, lineupData] = await Promise.all([
      this.sportApi.fetchIncidents(apiMatchId),
      this.sportApi.fetchLineups(apiMatchId),
    ]);

    const [incidents, hasIncidentData] = incidentsData;

    // Blacklist — mecz bez danych incydentów
    if (!hasIncidentData) {
      await this.prisma.liveMatch.update({
        where: { id: localMatchId },
        data: { hasIncidentData: false },
      });
      return;
    }

    // Save events
    if (incidents.length > 0) {
      await this.saveIncidents(localMatchId, incidents);
    }

    // Save lineups
    if (lineupData) {
      await this.saveLineups(localMatchId, lineupData);
    }
  }

  private async saveIncidents(
    matchId: number,
    incidents: ApiEvent[],
  ): Promise<void> {
    for (const item of incidents) {
      try {
        const mapped = this.mapIncident(item);
        const { match: _m, matchId: _mid, ...data } = mapped as Record<string, unknown>;

        await this.prisma.matchEvent.upsert({
          where: {
            matchId_eventId: {
              matchId,
              eventId: data['eventId'] as string,
            },
          },
          create: {
            ...(data as Prisma.MatchEventUncheckedCreateInput),
            matchId,
          },
          update: data as Prisma.MatchEventUncheckedUpdateInput,
        });
      } catch (err) {
        this.logger.warn(`saveIncidents skip item ${item['id']}: ${String(err)}`);
      }
    }
  }

  private async saveLineups(
    matchId: number,
    lineupData: ApiEvent,
  ): Promise<void> {
    const sides = [
      { key: 'home', isHomeTeam: true },
      { key: 'away', isHomeTeam: false },
    ];

    for (const { key, isHomeTeam } of sides) {
      const side = lineupData[key] as ApiEvent | null;
      if (!side) continue;

      const players = (side['players'] as ApiEvent[]) ?? [];
      const formation = (side['formation'] as string) ?? null;

      // Update formation on match
      if (formation) {
        const updateData = isHomeTeam
          ? { homeFormation: formation }
          : { awayFormation: formation };
        await this.prisma.liveMatch.update({
          where: { id: matchId },
          data: updateData,
        });
      }

      for (const p of players) {
        const playerData = (p['player'] as ApiEvent) ?? {};
        const playerName = (playerData['name'] as string) ?? 'Unknown';

        try {
          await this.prisma.matchLineup.upsert({
            where: {
              matchId_playerName_isHomeTeam: {
                matchId,
                playerName,
                isHomeTeam,
              },
            },
            create: {
              matchId,
              playerName,
              isHomeTeam,
              playerApiId: playerData['id'] as number | null,
              shirtNumber: p['shirtNumber'] as number | null,
              position: p['position'] as string | null,
              isStartingXi: (p['substitute'] as boolean) !== true,
              isCaptain: (p['captain'] as boolean) ?? false,
              avgRating: p['avgRating'] != null
                ? String(p['avgRating'])
                : null,
            },
            update: {
              shirtNumber: p['shirtNumber'] as number | null,
              isStartingXi: (p['substitute'] as boolean) !== true,
              isCaptain: (p['captain'] as boolean) ?? false,
              avgRating: p['avgRating'] != null
                ? String(p['avgRating'])
                : null,
            },
          });
        } catch (err) {
          this.logger.warn(`saveLineups skip ${playerName}: ${String(err)}`);
        }
      }

      // Missing players
      const missing = (side['missingPlayers'] as ApiEvent[]) ?? [];
      for (const mp of missing) {
        const playerData = (mp['player'] as ApiEvent) ?? {};
        try {
          await this.prisma.missingPlayer.upsert({
            where: {
              id: 0, // force create; use findFirst pattern below
            },
            create: {
              matchId,
              playerName: (playerData['name'] as string) ?? 'Unknown',
              type: (mp['type'] as string) ?? 'missing',
              reason: mp['reason'] as string | null,
              isHomeTeam,
            },
            update: {},
          }).catch(() => {
            // If upsert fails (id=0), try create
            return this.prisma.missingPlayer.create({
              data: {
                matchId,
                playerName: (playerData['name'] as string) ?? 'Unknown',
                type: (mp['type'] as string) ?? 'missing',
                reason: mp['reason'] as string | null,
                isHomeTeam,
              },
            });
          });
        } catch {
          // ignore duplicates
        }
      }
    }
  }

  // ===========================================================================
  //  QUERIES (REST endpoints)
  // ===========================================================================

  /**
   * FIX BUG #1: zwraca mecze ze WSZYSTKICH statusów live, nie tylko "half".
   */
  async findAllLive() {
    return this.prisma.liveMatch.findMany({
      where: {
        status: {
          notIn: [...SportApiService.ENDED_STATUSES, 'Not started'],
          not: { startsWith: 'Not' },
        },
      },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: [{ league: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  async findMatchById(id: number) {
    return this.prisma.liveMatch.findUnique({
      where: { id },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
        events: {
          orderBy: [{ time: 'desc' }, { addedTime: 'desc' }, { id: 'desc' }],
        },
        lineups: { orderBy: { shirtNumber: 'asc' } },
        missingPlayers: true,
      },
    });
  }

  /** Zwraca listę api_id meczów, dla których ktoś ma aktywną subskrypcję */
  async getSubscribedMatchApiIds(): Promise<number[]> {
    const subscriptions = await this.prisma.matchSubscription.findMany({
      where: { isActive: true },
      select: { match: { select: { apiId: true } } },
      distinct: ['matchId'],
    });
    return subscriptions.map((s) => s.match.apiId);
  }

  async isMatchOfInterest(matchId: number): Promise<boolean> {
    const sub = await this.prisma.matchSubscription.findFirst({
      where: { matchId, isActive: true },
    });
    if (sub) return true;

    const match = await this.prisma.liveMatch.findUnique({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    if (!match) return false;

    const teamIds = [match.homeTeamId, match.awayTeamId].filter(Boolean) as number[];
    if (teamIds.length === 0) return false;

    const fav = await this.prisma.favoriteTeam.findFirst({
      where: { teamId: { in: teamIds }, isActive: true },
    });
    return !!fav;
  }
}
