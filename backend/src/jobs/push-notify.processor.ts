import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { MatchesGateway } from '../matches/matches.gateway.js';
import { MatchesService } from '../matches/matches.service.js';

/**
 * PushNotifyProcessor — odpowiednik Celery push_tasks.py
 *
 * Przetwarza incydenty meczu (gole, kartki, zmiany) i wysyła:
 *   1. WebSocket broadcast (MatchesGateway)
 *
 * FIX BUG #8: retry z exponential backoff (konfigurowane w SyncMatchesJob.queue.add)
 */

const EVENT_LABELS: Record<string, [string, string]> = {
  'goal:regular': ['⚽', 'GOOOL!'],
  'goal:ownGoal': ['⚽', 'Own goal!'],
  'goal:penalty': ['⚽', 'Penalty goal!'],
  'card:yellow': ['🟨', 'Yellow card!'],
  'card:red': ['🟥', 'Red card!'],
  'card:yellowRed': ['🟨🟥', 'Second yellow → red!'],
  'varDecision:goalCancelled': ['❌', 'Goal cancelled (VAR)!'],
  'varDecision:cardUpgrade': ['📺', 'Card upgraded (VAR)!'],
  'varDecision:penaltyNotGiven': ['📺', 'Penalty overturned (VAR)!'],
  'varDecision:penaltyGiven': ['🎯', 'Penalty awarded (VAR)!'],
  'inGamePenalty:scored': ['🎯', 'Penalty - GOAL!'],
  'inGamePenalty:missed': ['💨', 'Penalty missed!'],
  'inGamePenalty:penaltyAwarded': ['🎯', 'Penalty awarded!'],
};

type ApiIncident = Record<string, unknown>;

@Processor('push-notify')
export class PushNotifyProcessor {
  private readonly logger = new Logger(PushNotifyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly gateway: MatchesGateway,
    private readonly matchesService: MatchesService,
  ) {}

  @Process('process-incidents')
  async handleProcessIncidents(job: Job<{ apiId: number }>) {
    const { apiId } = job.data;
    this.logger.log(`PushNotify: processing apiId=${apiId}`);

    const match = await this.prisma.liveMatch.findUnique({
      where: { apiId },
      include: { homeTeam: true, awayTeam: true },
    });

    if (!match) {
      this.logger.warn(`PushNotify: match apiId=${apiId} not found in DB`);
      return;
    }

    // Skip blacklisted matches (no incident data)
    if (!match.hasIncidentData) {
      this.logger.debug(`PushNotify: match ${apiId} blacklisted, skipping`);
      return;
    }

    // Skip if nobody is watching
    const isInteresting = await this.matchesService.isMatchOfInterest(match.id);
    if (!isInteresting) {
      this.logger.debug(`PushNotify: match ${apiId} not of interest`);
      return;
    }

    const [incidents, hasData] = await this.sportApi.fetchIncidents(apiId);

    if (!hasData) {
      await this.prisma.liveMatch.update({
        where: { id: match.id },
        data: { hasIncidentData: false },
      });
      return;
    }

    const notifiedIds = (match.notifiedEventIds as string[]) ?? [];
    const newNotifiedIds = [...notifiedIds];
    const homeName = match.homeTeam?.name ?? 'Home';
    const awayName = match.awayTeam?.name ?? 'Away';

    for (const inc of incidents as ApiIncident[]) {
      const eventId = String(inc['id'] ?? '');
      if (!eventId || notifiedIds.includes(eventId)) continue;

      const iType = inc['incidentType'] as string;
      const iClass = inc['incidentClass'] as string | undefined;
      const labelKey = iClass ? `${iType}:${iClass}` : iType;
      const [icon, label] = EVENT_LABELS[labelKey] ?? ['ℹ️', 'Match event'];

      const player = ((inc['player'] as Record<string, unknown>)?.['name'] as string) ?? '';
      const minute = inc['time'] as number | undefined;
      const isHome = inc['isHome'] !== false;
      const teamName = isHome ? homeName : awayName;

      let message = `${teamName}: ${label}`;
      if (player) message += ` — ${player}`;
      if (minute != null) message += ` (${minute}')`;

      // WebSocket broadcast
      this.gateway.broadcastMatchEvent(apiId, {
        eventType: iType,
        icon,
        message,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
      });

      newNotifiedIds.push(eventId);
    }

    // Update notified event IDs
    if (newNotifiedIds.length !== notifiedIds.length) {
      await this.prisma.liveMatch.update({
        where: { id: match.id },
        data: { notifiedEventIds: newNotifiedIds },
      });
    }
  }
}
