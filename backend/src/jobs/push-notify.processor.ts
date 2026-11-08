import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { MatchesGateway } from '../matches/matches.gateway.js';
import { MatchesService } from '../matches/matches.service.js';
import { PushService } from '../notifications/push.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { currentMatchMinute } from '../matches/domain/match-minute.js';
import { planNotifications } from '../matches/domain/push-planner.js';

const MAX_REMEMBERED_IDS = 500;

/**
 * Odpowiednik Celery process_match_incidents_and_notify + send_match_event_notification.
 * Wywoływany wyłącznie dla meczów, w których sync wykrył zmianę wyniku/statusu.
 *
 * Kolejność: (1) ustal co jest nowe, (2) ZAPISZ stan (notifiedEventIds / lastNotifiedScore),
 * (3) roześlij. Zapis przed wysyłką + blokada per mecz = brak duplikatów przy ponowieniu joba
 * (cena: przy awarii w trakcie rozsyłania powiadomienie może zostać zgubione, nie zdublowane).
 */
@Processor('push-notify')
export class PushNotifyProcessor {
  private readonly logger = new Logger(PushNotifyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly gateway: MatchesGateway,
    private readonly matches: MatchesService,
    private readonly push: PushService,
    private readonly lock: LockService,
    private readonly config: ConfigService,
  ) {}

  @Process('process-incidents')
  async handle(job: Job<{ apiId: number }>) {
    const { apiId } = job.data;
    const key = `process-incidents:${apiId}`;
    const token = await this.lock.acquire(key, 30_000);
    if (!token) {
      this.logger.debug(`match ${apiId}: another worker is processing — skip`);
      return;
    }
    try {
      await this.process(apiId);
    } finally {
      await this.lock.release(key, token);
    }
  }

  private async process(apiId: number): Promise<void> {
    const match = await this.prisma.liveMatch.findUnique({
      where: { apiId },
      include: { homeTeam: true, awayTeam: true, league: true },
    });
    if (!match || !match.homeTeam || !match.awayTeam) return;

    // Blacklista meczów bez danych incydentów (404/403/204 z API)
    if (!match.hasIncidentData) return;

    // Niszowe ligi — oszczędzamy limit API (wyłączalne: PUSH_ALL_LEAGUES=true)
    if (
      this.config.get<string>('PUSH_ALL_LEAGUES') !== 'true' &&
      !SportApiService.isTopLeague(match.league?.apiId)
    ) {
      return;
    }

    // Pre-flight: nikt nie obserwuje → zero zapytań do API
    if (!(await this.matches.isMatchOfInterest(match.id))) return;

    const [incidents, hasData] = await this.sportApi.fetchIncidents(apiId);
    if (!hasData) {
      await this.prisma.liveMatch.update({ where: { id: match.id }, data: { hasIncidentData: false } });
      this.logger.log(`🚫 blacklisted match ${apiId} (no incident data)`);
      return;
    }

    const stored = Array.isArray(match.notifiedEventIds)
      ? (match.notifiedEventIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const plan = planNotifications({
      homeName: match.homeTeam.name,
      awayName: match.awayTeam.name,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
      currentMinute: currentMatchMinute(match),
      notifiedEventIds: stored,
      lastNotifiedScore: match.lastNotifiedScore,
      incidents,
    });

    if (plan.dirty) {
      await this.prisma.liveMatch.update({
        where: { id: match.id },
        data: {
          notifiedEventIds: [
            ...stored.filter((id) => !plan.removedNotifiedIds.includes(id)),
            ...plan.newNotifiedIds,
          ].slice(-MAX_REMEMBERED_IDS),
          lastNotifiedScore: plan.lastNotifiedScore,
        },
      });
    }
    if (plan.notifications.length === 0) return;

    const recipients = await this.matches.resolveRecipientUserIds(match.id, [
      match.homeTeam.id,
      match.awayTeam.id,
    ]);
    const base = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').split(',')[0]!.trim();
    const url = `${base}/match/${match.id}`;

    for (const n of plan.notifications) {
      try {
        this.gateway.broadcastMatchEvent(apiId, recipients, {
          key: `${apiId}:${n.key}`,
          eventType: n.eventType,
          icon: n.icon,
          title: n.title,
          message: n.body,
          homeScore: n.homeScore,
          awayScore: n.awayScore,
          status: match.status,
        });
        const sent = await this.push.sendToUsers(recipients, {
          title: n.title,
          body: n.body,
          url,
          key: `${apiId}:${n.key}`,
        });
        this.logger.log(`🔔 ${apiId} "${n.title}" → ${recipients.length} user(s), ${sent} push`);
      } catch (err) {
        this.logger.warn(`dispatch failed for ${apiId} (${n.key}): ${String(err)}`);
      }
    }
  }
}
