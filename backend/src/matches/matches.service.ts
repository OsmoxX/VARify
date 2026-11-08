import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { EntitiesService, isForeignKeyViolation } from '../entities/entities.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { MatchesGateway } from './matches.gateway.js';
import { MATCH_INCLUDE } from './match-dto.js';
import { mapIncident } from './domain/incident-mapper.js';
import { type Json, arr, bool, num, obj, str } from '../common/utils/json.js';
import { unixToDate } from '../common/utils/timezone.js';

/** Fragmenty statusu świadczące, że mecz jest "w trakcie" (Django: regex w sync_live_matches). */
const LIVE_STATUS_WORDS = [
  'half',
  'extra',
  'awaiting',
  'penalt',
  'break',
  'live',
  'progress',
  'period',
  'paused',
  'interval',
];
const ENDED_LIST = [...SportApiService.ENDED_STATUSES];

export interface LiveFilters {
  league?: string;
  top?: boolean;
  search?: string;
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly gateway: MatchesGateway,
    private readonly entities: EntitiesService,
    private readonly lock: LockService,
  ) {}

  // ===========================================================================
  //  SYNC LIVE MATCHES
  // ===========================================================================

  /**
   * Synchronizuje mecze live API → DB. Zwraca api_id meczów ze zmianą wyniku/statusu
   * (te trafiają do kolejki powiadomień). Pomija sync całkowicie, gdy API zawiedzie —
   * wtedy NIE kończymy "zaginionych" meczów (inaczej awaria API zamknęłaby wszystkie).
   */
  async syncLiveMatches(): Promise<number[]> {
    const data = await this.sportApi.fetchLiveMatches();
    if (!data || !Array.isArray(data['events'])) {
      this.logger.warn('syncLiveMatches: no data from API');
      return [];
    }

    const events = arr(data['events']);
    const changed: number[] = [];
    const liveIds = new Set<number>();

    for (const event of events) {
      const id = num(event['id']);
      if (id !== null) liveIds.add(id);
      try {
        let changedId: number | null;
        try {
          changedId = await this.upsertMatch(event);
        } catch (err) {
          // Liga/drużyna usunięta z bazy spod cache'u ID → wyczyść cache i spróbuj raz jeszcze.
          if (!isForeignKeyViolation(err)) throw err;
          this.entities.clearCache();
          changedId = await this.upsertMatch(event);
        }
        if (changedId !== null) changed.push(changedId);
      } catch (err) {
        this.logger.error(`Error processing event ${id ?? '?'}: ${String(err)}`);
      }
    }

    const ended = await this.endStaleMatches(liveIds);
    for (const id of ended) if (!changed.includes(id)) changed.push(id);

    this.logger.log(
      `syncLiveMatches: ${events.length} events, ${changed.length} changed, ${ended.length} auto-ended`,
    );
    return changed;
  }

  private async upsertMatch(event: Json): Promise<number | null> {
    const apiId = num(event['id']);
    const tournament = obj(event['tournament']);
    const unique = obj(tournament['uniqueTournament']);
    const leagueApiId = str(unique['id']) ?? str(tournament['id']);
    const home = obj(event['homeTeam']);
    const away = obj(event['awayTeam']);
    const homeApiId = num(home['id']);
    const awayApiId = num(away['id']);
    if (apiId === null || !leagueApiId || homeApiId === null || awayApiId === null) {
      throw new Error('malformed event (missing id/tournament/teams)');
    }

    const leagueName = str(unique['name']) ?? str(tournament['name']) ?? 'Unknown league';
    const countryName = str(obj(tournament['category'])['name']) ?? 'Other';

    const [leagueId, homeTeamId, awayTeamId] = await Promise.all([
      this.entities.ensureLeague(leagueApiId, leagueName, countryName),
      this.entities.ensureTeam(homeApiId, str(home['name']) ?? 'Home'),
      this.entities.ensureTeam(awayApiId, str(away['name']) ?? 'Away'),
    ]);

    const status = str(obj(event['status'])['description']) ?? '';
    // startTimestamp to Unix UTC — zapisujemy 1:1 (Django dodawało na sztywno +2h).
    const startDatetime = unixToDate(event['startTimestamp']);

    const time = obj(event['time']);
    const periodStart = num(time['currentPeriodStartTimestamp']);
    const initialMin = Math.floor((num(time['initial']) ?? 0) / 60);

    const homeScore = num(obj(event['homeScore'])['current']) ?? 0;
    const awayScore = num(obj(event['awayScore'])['current']) ?? 0;

    const existing = await this.prisma.liveMatch.findUnique({
      where: { apiId },
      select: { homeScore: true, awayScore: true, status: true },
    });

    const homeUp = !!existing && homeScore > existing.homeScore;
    const awayUp = !!existing && awayScore > existing.awayScore;
    const scoreChanged = homeUp || awayUp;
    const scoreDiffers =
      !!existing && (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    const newlyLive =
      !existing &&
      !!status &&
      !SportApiService.isNotStartedStatus(status) &&
      !SportApiService.isEndedStatus(status);
    const statusChanged = (!!existing && !!status && existing.status !== status) || newlyLive;

    const data = {
      leagueId,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      status: status.slice(0, 50),
      minute: periodStart ? initialMin : 0,
      matchTime: periodStart ? String(periodStart) : null,
      startDatetime,
      matchDate: startDatetime ? new Date(startDatetime.toISOString().slice(0, 10)) : null,
      countryName: countryName.slice(0, 100),
      isTop: SportApiService.isTopLeague(leagueApiId),
    };

    await this.prisma.liveMatch.upsert({
      where: { apiId },
      create: { apiId, ...data },
      update: data,
    });

    // Broadcast PO zapisie — klient, który odświeży REST po evencie, zobaczy spójny stan.
    if (scoreDiffers) {
      this.gateway.broadcastScoreUpdate(apiId, {
        homeScore,
        awayScore,
        status,
        goal: scoreChanged,
        scoringSide: homeUp && !awayUp ? 'home' : awayUp && !homeUp ? 'away' : null,
      });
    }
    if (statusChanged && !scoreDiffers) {
      this.gateway.broadcastStatusUpdate(apiId, { status });
    }

    return scoreChanged || statusChanged ? apiId : null;
  }

  /** Mecze "w trakcie", których nie ma już w feedzie live → Ended (+ broadcast). */
  private async endStaleMatches(liveIds: Set<number>): Promise<number[]> {
    const stale = await this.prisma.liveMatch.findMany({
      where: {
        apiId: { notIn: [...liveIds] },
        OR: LIVE_STATUS_WORDS.map((w) => ({ status: { contains: w } })),
        NOT: { status: { in: ENDED_LIST } },
      },
      select: { id: true, apiId: true },
    });
    for (const m of stale) {
      await this.prisma.liveMatch.update({ where: { id: m.id }, data: { status: 'Ended' } });
      this.gateway.broadcastStatusUpdate(m.apiId, { status: 'Ended' });
    }
    return stale.map((m) => m.apiId);
  }

  // ===========================================================================
  //  FETCH MATCH DETAILS (stan, zdarzenia, składy, statystyki)
  // ===========================================================================

  /**
   * Jak fetchMatchDetails, ale z blokadą 60 s per mecz (Django cache.add) — chroni limit API
   * przy wielu wejściach na stronę meczu. Zwraca false, gdy pobranie pominięto.
   */
  async fetchMatchDetailsThrottled(localId: number, apiId: number): Promise<boolean> {
    const token = await this.lock.acquire(`match-details:${apiId}`, 60_000);
    if (!token) return false; // celowo bez release — TTL działa jak throttle
    await this.fetchMatchDetails(localId, apiId);
    return true;
  }

  async fetchMatchDetails(localId: number, apiId: number): Promise<void> {
    const match = await this.prisma.liveMatch.findUnique({
      where: { id: localId },
      include: { league: true },
    });
    if (!match) return;

    await this.refreshMatchState(match.id, apiId);

    // Niszowe ligi: pomijamy incydenty/składy/statystyki (oszczędność limitu API).
    if (!SportApiService.isTopLeague(match.league?.apiId)) return;

    const [[incidents], lineups, stats] = await Promise.all([
      this.sportApi.fetchIncidents(apiId),
      this.sportApi.fetchLineups(apiId),
      this.sportApi.fetchStatistics(apiId),
    ]);

    await this.saveIncidents(match.id, incidents);
    if (lineups) await this.saveLineups(match.id, lineups);
    if (stats && stats.length > 0) {
      await this.prisma.liveMatch.update({
        where: { id: match.id },
        data: { statsJson: stats as unknown as Prisma.InputJsonValue },
      });
    }
  }

  /** Odświeża wynik/status/minutę z /event/{id}. */
  private async refreshMatchState(localId: number, apiId: number): Promise<void> {
    const ev = await this.sportApi.fetchMatchDetail(apiId);
    if (!ev || Object.keys(ev).length === 0) return;

    const time = obj(ev['time']);
    const periodStart = num(time['currentPeriodStartTimestamp']);
    const initialMin = Math.floor((num(time['initial']) ?? 0) / 60);
    const status = str(obj(ev['status'])['description']);
    const homeScore = num(obj(ev['homeScore'])['current']);
    const awayScore = num(obj(ev['awayScore'])['current']);

    const data: Prisma.LiveMatchUpdateInput = {};
    if (periodStart) {
      data.matchTime = String(periodStart);
      data.minute = initialMin;
    } else {
      const exact = num(time['current']) ?? num(time['played']) ?? 0;
      if (exact > 0) {
        data.minute = exact;
        data.matchTime = null;
      }
    }
    if (status) data.status = status.slice(0, 50);
    if (homeScore !== null) data.homeScore = homeScore;
    if (awayScore !== null) data.awayScore = awayScore;
    if (Object.keys(data).length > 0) {
      await this.prisma.liveMatch.update({ where: { id: localId }, data });
    }
  }

  private async saveIncidents(matchId: number, incidents: Json[]): Promise<void> {
    const CHUNK = 10;
    for (let i = 0; i < incidents.length; i += CHUNK) {
      await Promise.all(
        incidents.slice(i, i + CHUNK).map(async (item) => {
          try {
            const mapped = mapIncident(item);
            await this.prisma.matchEvent.upsert({
              where: { matchId_eventId: { matchId, eventId: mapped.eventId } },
              create: { ...mapped, matchId },
              update: mapped,
            });
          } catch (err) {
            this.logger.warn(`saveIncidents skip ${str(item['id']) ?? '?'}: ${String(err)}`);
          }
        }),
      );
    }
  }

  private async saveLineups(matchId: number, lineupData: Json): Promise<void> {
    for (const [key, isHomeTeam] of [
      ['home', true],
      ['away', false],
    ] as const) {
      const side = obj(lineupData[key]);
      if (Object.keys(side).length === 0) continue;

      const formation = str(side['formation']);
      if (formation) {
        await this.prisma.liveMatch.update({
          where: { id: matchId },
          data: isHomeTeam
            ? { homeFormation: formation.slice(0, 20) }
            : { awayFormation: formation.slice(0, 20) },
        });
      }

      for (const p of arr(side['players'])) {
        const info = obj(p['player']);
        const playerName = (str(info['name']) ?? 'Unknown').slice(0, 100);
        const position = str(info['position']);
        const substitute = (bool(p['substitute']) ?? false) || position === 'S';
        const fields = {
          playerApiId: num(info['id']),
          shirtNumber: num(info['jerseyNumber']) ?? num(p['shirtNumber']),
          position: position ? position.slice(0, 50) : null,
          isStartingXi: !substitute,
          isCaptain: bool(p['captain']) ?? false,
          avgRating: str(obj(p['statistics'])['rating'])?.slice(0, 10) ?? null,
        };
        try {
          await this.prisma.matchLineup.upsert({
            where: { matchId_playerName_isHomeTeam: { matchId, playerName, isHomeTeam } },
            create: { matchId, playerName, isHomeTeam, ...fields },
            update: fields,
          });
        } catch (err) {
          this.logger.warn(`saveLineups skip ${playerName}: ${String(err)}`);
        }
      }

      for (const mp of arr(side['missingPlayers'])) {
        const name = str(obj(mp['player'])['name']);
        if (!name) continue;
        const playerName = name.slice(0, 100);
        const fields = {
          type: (str(mp['type']) ?? 'missing').slice(0, 50),
          reason: str(mp['reason'])?.slice(0, 255) ?? null,
        };
        try {
          await this.prisma.missingPlayer.upsert({
            where: { matchId_playerName_isHomeTeam: { matchId, playerName, isHomeTeam } },
            create: { matchId, playerName, isHomeTeam, ...fields },
            update: fields,
          });
        } catch (err) {
          this.logger.warn(`saveMissing skip ${playerName}: ${String(err)}`);
        }
      }
    }
  }

  // ===========================================================================
  //  QUERIES
  // ===========================================================================

  /** Mecze w trakcie (wszystkie statusy live — Django filtrowało tylko "half"). */
  findAllLive(filters: LiveFilters = {}) {
    const and: Prisma.LiveMatchWhereInput[] = [
      { status: { notIn: ['', ...ENDED_LIST] } },
      { NOT: { status: { startsWith: 'Not' } } },
    ];
    if (filters.league) and.push({ league: { apiId: filters.league } });
    if (filters.top) and.push({ isTop: true });
    if (filters.search) {
      and.push({
        OR: [
          { homeTeam: { name: { contains: filters.search } } },
          { awayTeam: { name: { contains: filters.search } } },
          { league: { name: { contains: filters.search } } },
        ],
      });
    }
    return this.prisma.liveMatch.findMany({
      where: { AND: and },
      include: MATCH_INCLUDE,
      orderBy: [{ league: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  findMatchById(id: number) {
    return this.prisma.liveMatch.findUnique({
      where: { id },
      include: {
        ...MATCH_INCLUDE,
        events: { orderBy: [{ time: 'desc' }, { addedTime: 'desc' }, { id: 'desc' }] },
        lineups: { orderBy: { shirtNumber: 'asc' } },
        missingPlayers: true,
      },
    });
  }

  /** Podzbiór podanych api_id, które nadal trwają (Django active_match_ids). */
  async activeApiIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.liveMatch.findMany({
      where: { apiId: { in: ids }, status: { notIn: ['', ...ENDED_LIST] } },
      select: { apiId: true },
    });
    return rows.map((r) => r.apiId);
  }

  /** Czy ktokolwiek śledzi mecz (dzwoneczek lub ulubiona drużyna)? */
  async isMatchOfInterest(matchId: number): Promise<boolean> {
    const sub = await this.prisma.matchSubscription.findFirst({
      where: { matchId, isActive: true },
      select: { id: true },
    });
    if (sub) return true;

    const match = await this.prisma.liveMatch.findUnique({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const teamIds = [match?.homeTeamId, match?.awayTeamId].filter(
      (x): x is number => typeof x === 'number',
    );
    if (teamIds.length === 0) return false;
    const fav = await this.prisma.favoriteTeam.findFirst({
      where: { teamId: { in: teamIds }, isActive: true },
      select: { id: true },
    });
    return !!fav;
  }

  /**
   * Odbiorcy powiadomień: subskrybenci dzwoneczka + fani drużyn, minus użytkownicy, którzy
   * aktywnie wyciszyli mecz (subskrypcja z isActive=false).
   */
  async resolveRecipientUserIds(matchId: number, teamIds: number[]): Promise<number[]> {
    const [subs, muted, fans] = await Promise.all([
      this.prisma.matchSubscription.findMany({
        where: { matchId, isActive: true, userId: { not: null } },
        select: { userId: true },
      }),
      this.prisma.matchSubscription.findMany({
        where: { matchId, isActive: false, userId: { not: null } },
        select: { userId: true },
      }),
      teamIds.length
        ? this.prisma.favoriteTeam.findMany({
            where: { teamId: { in: teamIds }, isActive: true },
            select: { userId: true },
          })
        : Promise.resolve([] as { userId: number }[]),
    ]);
    const mutedIds = new Set(muted.map((m) => m.userId as number));
    const result = new Set<number>(subs.map((s) => s.userId as number));
    for (const f of fans) if (!mutedIds.has(f.userId)) result.add(f.userId);
    return [...result];
  }
}
