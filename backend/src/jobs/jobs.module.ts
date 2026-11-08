import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncMatchesJob } from './sync-matches.job.js';
import { PushNotifyProcessor } from './push-notify.processor.js';
import { DailyJobs } from './calendar.job.js';
import { MatchesModule } from '../matches/matches.module.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { LeaguesModule } from '../leagues/leagues.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'push-notify' }),
    MatchesModule,
    SportApiModule,
    NotificationsModule,
    CalendarModule,
    LeaguesModule,
  ],
  providers: [SyncMatchesJob, PushNotifyProcessor, DailyJobs],
})
export class JobsModule {}
