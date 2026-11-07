import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { MatchesModule } from './matches/matches.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SportApiModule } from './sport-api/sport-api.module.js';
import { AiModule } from './ai/ai.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PlayersModule } from './players/players.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { CalendarModule } from './calendar/calendar.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // BullMQ — Redis-backed queues
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      }),
    }),

    // Global DB module
    PrismaModule,

    // Feature modules
    AuthModule,
    AccountsModule,
    MatchesModule,
    NotificationsModule,
    SportApiModule,
    AiModule,
    JobsModule,
    PlayersModule,
    TeamsModule,
    CalendarModule,
  ],
})
export class AppModule {}
