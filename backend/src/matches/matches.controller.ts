import {
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { MatchesService } from './matches.service.js';
import { toMatchSummary } from './match-dto.js';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TierGuard } from '../common/guards/tier.guard.js';
import { RequireTier } from '../common/decorators/require-tier.decorator.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { TierService } from '../common/tier.service.js';
import { hasAccess } from '../common/utils/tier.js';
import { groupByLeague } from '../common/utils/group.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentMatchMinute } from './domain/match-minute.js';
import { buildPitchData } from './domain/pitch.js';
import { parseStats } from './domain/stats.js';
import { cardColor, formattedTime, isInjuryTimeAnnouncement, isPeriodMarker, shouldShowEvent } from './domain/event-view.js';
import { pageParams, paginated } from '../common/utils/pagination.js';
import { EventsQueryDto, LineupsQueryDto, LiveQueryDto } from './dto.js';
import type { MatchEvent, MatchLineup, MissingPlayer } from '@prisma/client';

const toEventView = (e: MatchEvent) => ({
  id: e.id,
  incidentType: e.incidentType,
  time: e.time,
  addedTime: e.addedTime,
  formattedTime: formattedTime(e),
  side: isPeriodMarker(e) || isInjuryTimeAnnouncement(e) ? 'neutral' : e.isHome ? 'home' : 'away',
  isHome: e.isHome,
  playerName: e.playerName,
  assistPlayerName: e.assistPlayerName,
  assist2PlayerName: e.assist2PlayerName,
  playerInName: e.playerInName,
  playerOutName: e.playerOutName,
  injury: e.injury,
  homeScore: e.homeScore,
  awayScore: e.awayScore,
  incidentClass: e.incidentClass,
  cardColor: cardColor(e.incidentClass, e.incidentType),
  reason: e.reason,
  rescinded: e.rescinded,
  text: e.text,
  isLive: e.isLive,
  injuryTimeLength: e.injuryTimeLength,
  confirmed: e.confirmed,
});

const toLineupView = (l: MatchLineup) => ({
  id: l.id,
  playerName: l.playerName,
  playerApiId: l.playerApiId,
  shirtNumber: l.shirtNumber,
  position: l.position,
  isHomeTeam: l.isHomeTeam,
  isStartingXi: l.isStartingXi,
  isCaptain: l.isCaptain,
  avgRating: l.avgRating,
});

const toMissingView = (m: MissingPlayer) => ({
  id: m.id,
  playerName: m.playerName,
  type: m.type,
  reason: m.reason,
  isHomeTeam: m.isHomeTeam,
});

@Controller('matches')
export class MatchesController {
  private readonly logger = new Logger(MatchesController.name);

  constructor(
    private readonly matches: MatchesService,
    private readonly tiers: TierService,
    private readonly prisma: PrismaService,
    @InjectQueue('match-details') private readonly detailsQueue: Queue,
  ) {}

  /** GET /api/matches/live?league=&top=&search= — publiczne */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  async live(@Query() q: LiveQueryDto) {
    const rows = await this.matches.findAllLive(q);
    const now = Date.now();
    const summaries = rows.map((m) => toMatchSummary(m, now));
    return {
      leagues: groupByLeague(summaries),
      total: summaries.length,
      serverTime: now,
    };
  }

  /** GET /api/matches/active?ids=1,2,3 — które z podanych api_id nadal trwają */
  @Get('active')
  @Header('Cache-Control', 'no-store')
  async active(@Query('ids') ids?: string) {
    const parsed = (ids ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isSafeInteger(n) && n > 0)
      .slice(0, 200);
    return { activeIds: await this.matches.activeApiIds(parsed) };
  }

  /** GET /api/matches/:id — szczegóły; składy (PLUS) i statystyki (PREMIUM) egzekwowane tutaj */
  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @Header('Cache-Control', 'no-store')
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser | null) {
    let match = await this.matches.findMatchById(id);
    if (!match) throw new NotFoundException('Match not found');

    const ended = SportApiService.isEndedStatus(match.status);
    const hasData = match.events.length > 0 || !!match.statsJson;

    if (!hasData) {
      // Pierwsze wejście: pobieramy synchronicznie, żeby nie pokazać pustej osi czasu.
      try {
        await this.matches.fetchMatchDetailsThrottled(match.id, match.apiId);
        match = (await this.matches.findMatchById(id)) ?? match;
      } catch (err) {
        this.logger.warn(`first-visit details fetch failed for ${id}: ${String(err)}`);
      }
    } else if (!ended) {
      // Kolejne wejścia: odświeżenie w tle przez kolejkę (jobId = dedup).
      this.detailsQueue
        .add(
          'fetch',
          { localId: match.id, apiId: match.apiId },
          {
            jobId: `details-${match.apiId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
        .catch((err: unknown) => this.logger.warn(`enqueue details failed: ${String(err)}`));
    }

    const tier = await this.tiers.tierOf(user?.id);
    const canLineups = hasAccess(tier, 'PLUS');
    const canStats = hasAccess(tier, 'PREMIUM');

    const summary = toMatchSummary(match);
    const minute = currentMatchMinute(match);
    const events = ended
      ? match.events
      : match.events.filter((e) => shouldShowEvent(e, match.status, minute));

    const homeXi = match.lineups.filter((l) => l.isHomeTeam && l.isStartingXi);
    const awayXi = match.lineups.filter((l) => !l.isHomeTeam && l.isStartingXi);

    return {
      match: {
        ...summary,
        homeFormation: canLineups ? match.homeFormation : null,
        awayFormation: canLineups ? match.awayFormation : null,
      },
      events: events.map(toEventView),
      access: { tier, lineups: canLineups, stats: canStats },
      lineups: canLineups
        ? {
            homeXi: homeXi.map(toLineupView),
            homeSubs: match.lineups.filter((l) => l.isHomeTeam && !l.isStartingXi).map(toLineupView),
            awayXi: awayXi.map(toLineupView),
            awaySubs: match.lineups.filter((l) => !l.isHomeTeam && !l.isStartingXi).map(toLineupView),
          }
        : null,
      pitchHome: canLineups
        ? buildPitchData(homeXi, match.homeFormation, true).map((s) => ({ ...s, player: toLineupView(s.player as MatchLineup) }))
        : null,
      pitchAway: canLineups
        ? buildPitchData(awayXi, match.awayFormation, false).map((s) => ({ ...s, player: toLineupView(s.player as MatchLineup) }))
        : null,
      missingHome: canLineups ? match.missingPlayers.filter((p) => p.isHomeTeam).map(toMissingView) : null,
      missingAway: canLineups ? match.missingPlayers.filter((p) => !p.isHomeTeam).map(toMissingView) : null,
      stats: canStats ? parseStats(match.statsJson) : null,
    };
  }

  /** GET /api/matches/:id/events?page= — publiczne, stronicowane (Django api/live-matches/<id>/events/) */
  @Get(':id/events')
  async events(@Param('id', ParseIntPipe) id: number, @Query() q: EventsQueryDto) {
    const { page, skip, take } = pageParams(q.page);
    const where = { matchId: id };
    const [rows, count] = await Promise.all([
      this.prisma.matchEvent.findMany({
        where,
        orderBy: [{ time: 'asc' }, { addedTime: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.matchEvent.count({ where }),
    ]);
    return paginated(rows.map(toEventView), count, page);
  }

  /** GET /api/matches/:id/lineups?team=home|away — PLUS */
  @Get(':id/lineups')
  @UseGuards(JwtAuthGuard, TierGuard)
  @RequireTier('PLUS')
  async lineups(@Param('id', ParseIntPipe) id: number, @Query() q: LineupsQueryDto) {
    const rows = await this.prisma.matchLineup.findMany({
      where: {
        matchId: id,
        ...(q.team ? { isHomeTeam: q.team === 'home' } : {}),
      },
      orderBy: [{ isStartingXi: 'desc' }, { shirtNumber: 'asc' }, { id: 'asc' }],
    });
    return { results: rows.map(toLineupView) };
  }
}
