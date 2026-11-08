import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { MatchesService } from './matches.service.js';

/** Odpowiednik Celery fetch_match_details_task (blokada 60 s w serwisie). */
@Processor('match-details')
export class MatchDetailsProcessor {
  private readonly logger = new Logger(MatchDetailsProcessor.name);

  constructor(private readonly matches: MatchesService) {}

  @Process('fetch')
  async handle(job: Job<{ localId: number; apiId: number }>) {
    const { localId, apiId } = job.data;
    const done = await this.matches.fetchMatchDetailsThrottled(localId, apiId);
    this.logger.debug(`match-details ${apiId}: ${done ? 'fetched' : 'skipped (throttled)'}`);
  }
}
