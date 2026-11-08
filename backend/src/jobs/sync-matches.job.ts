import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { MatchesService } from '../matches/matches.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { ConfigService } from '@nestjs/config';

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
    private readonly config: ConfigService,
    @InjectQueue('push-notify') private readonly pushQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    // Plan darmowy (50 zapytań/mies.): SYNC_ENABLED=false wyłącza cron, a `npm run sync:once` robi jedno odświeżenie.
    if (this.config.get<string>('SYNC_ENABLED') === 'false') return;
    // SYNC_INTERVAL_SECONDS (domyślnie 60): rzadsze odświeżanie; blokada działa wtedy jako throttle.
    const every = Math.max(60, Number(this.config.get('SYNC_INTERVAL_SECONDS') ?? 60));
    const token = await this.lock.acquire('sync-live-matches', every * 1000 - 5_000);
    if (!token) {
      this.logger.debug('sync skipped (locked)');
      return;
    }
    try {
      const allChanged = await this.matches.syncLiveMatches();
      const changed = await this.matches.filterOfInterest(allChanged);
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
      if (every <= 60) await this.lock.release('sync-live-matches', token); // dłuższy interwał: blokada = throttle
    }
  }
}
