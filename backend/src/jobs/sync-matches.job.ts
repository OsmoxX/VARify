import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { MatchesService } from '../matches/matches.service.js';
import { LockService } from '../common/lock/lock.service.js';

/**
 * Odpowiednik Celery sync_live_matches (Beat co 60 s).
 * Blokada Redis (55 s) zapobiega nakładaniu się synchronizacji także między instancjami
 * (poprzednie `isRunning` w pamięci działało tylko w obrębie jednego procesu).
 */
@Injectable()
export class SyncMatchesJob {
  private readonly logger = new Logger(SyncMatchesJob.name);

  constructor(
    private readonly matches: MatchesService,
    private readonly lock: LockService,
    @InjectQueue('push-notify') private readonly pushQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const token = await this.lock.acquire('sync-live-matches', 55_000);
    if (!token) {
      this.logger.debug('sync skipped (locked)');
      return;
    }
    try {
      const changed = await this.matches.syncLiveMatches();
      await Promise.all(
        changed.map((apiId) =>
          this.pushQueue.add(
            'process-incidents',
            { apiId },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 200 },
          ),
        ),
      );
      if (changed.length) this.logger.log(`queued ${changed.length} process-incidents job(s)`);
    } catch (err) {
      this.logger.error(`sync failed: ${String(err)}`);
    } finally {
      await this.lock.release('sync-live-matches', token);
    }
  }
}
