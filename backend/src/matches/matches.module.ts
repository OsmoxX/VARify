import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchesGateway } from './matches.gateway.js';
import { MatchDetailsProcessor } from './match-details.processor.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [SportApiModule, AuthModule, BullModule.registerQueue({ name: 'match-details' })],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesGateway, MatchDetailsProcessor],
  exports: [MatchesService, MatchesGateway],
})
export class MatchesModule {}
