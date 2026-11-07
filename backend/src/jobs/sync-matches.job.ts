import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { MatchesService } from '../matches/matches.service.js';

/**
 * SyncMatchesJob — odpowiednik Celery sync_live_matches task
 *
 * Architektura:
 *   @Cron (co 60s) → syncLiveMatches → wykrywa zmiany
 *     → kolejkuje push-notify job dla każdego zmienionego meczu
 *
 * FIX BUG #2: Wszystko asynchroniczne — żaden HTTP worker nie jest blokowany.
 */
@Injectable()
export class SyncMatchesJob {
  private readonly logger = new Logger(SyncMatchesJob.name);
  private isRunning = false; // lock (odpowiednik Django cache.add)

  constructor(
    private readonly matchesService: MatchesService,
    @InjectQueue('push-notify') private readonly pushQueue: Queue,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.warn('SyncMatchesJob: skipping (already running)');
      return;
    }

    this.isRunning = true;
    try {
      this.logger.log('SyncMatchesJob: starting sync...');
      const changedApiIds = await this.matchesService.syncLiveMatches();

      if (changedApiIds.length > 0) {
        for (const apiId of changedApiIds) {
          await this.pushQueue.add(
            'process-incidents',
            { apiId },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
            },
          );
        }
        this.logger.log(
          `SyncMatchesJob: queued ${changedApiIds.length} push-notify jobs`,
        );
      } else {
        this.logger.log('SyncMatchesJob: no changes detected');
      }
    } finally {
      this.isRunning = false;
    }
  }
}
