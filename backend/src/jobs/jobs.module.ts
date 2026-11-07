import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncMatchesJob } from './sync-matches.job.js';
import { PushNotifyProcessor } from './push-notify.processor.js';
import { MatchesModule } from '../matches/matches.module.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: 'push-notify' },
      { name: 'calendar-sync' },
    ),
    MatchesModule,
    SportApiModule,
  ],
  providers: [SyncMatchesJob, PushNotifyProcessor],
})
export class JobsModule {}
