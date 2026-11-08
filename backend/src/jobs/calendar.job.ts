import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CalendarService } from '../calendar/calendar.service.js';
import { StandingsService } from '../leagues/standings.service.js';

/** Dzienne zadania Celery Beat: nadchodzące mecze (11:00) i tabele lig (13:19). */
@Injectable()
export class DailyJobs {
  private readonly logger = new Logger(DailyJobs.name);

  constructor(
    private readonly calendar: CalendarService,
    private readonly standings: StandingsService,
    private readonly config: ConfigService,
  ) {}

  private get disabled() {
    return this.config.get<string>('SYNC_ENABLED') === 'false';
  }

  @Cron('0 11 * * *', { timeZone: 'UTC' })
  async upcoming() {
    if (this.disabled) return;
    try {
      this.logger.log(`upcoming matches synced: ${await this.calendar.syncUpcomingWindow(5)}`);
    } catch (err) {
      this.logger.error(`upcoming sync failed: ${String(err)}`);
    }
  }

  @Cron('19 13 * * *', { timeZone: 'UTC' })
  async leagueTables() {
    if (this.disabled) return;
    try {
      this.logger.log(`standings synced for ${await this.standings.syncTopLeagues()} leagues`);
    } catch (err) {
      this.logger.error(`standings sync failed: ${String(err)}`);
    }
  }
}
