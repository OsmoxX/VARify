import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { EntitiesModule } from './entities/entities.module.js';
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
import { LeaguesModule } from './leagues/leagues.module.js';
import { SearchModule } from './search/search.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { ImagesModule } from './images/images.module.js';
import { HealthController } from './app.controller.js';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Django DRF: anon 5/min, user 20/min — tu luźniej (SPA robi więcej zapytań), ostrzej na auth/AI/Stripe
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: Number(config.get('THROTTLE_LIMIT') ?? 240) },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      }),
    }),
    PrismaModule,
    CommonModule,
    EntitiesModule,
    SportApiModule,
    AuthModule,
    AccountsModule,
    MatchesModule,
    NotificationsModule,
    AiModule,
    JobsModule,
    PlayersModule,
    TeamsModule,
    CalendarModule,
    LeaguesModule,
    SearchModule,
    FavoritesModule,
    ImagesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
