import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchesGateway } from './matches.gateway.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesGateway],
  exports: [MatchesService, MatchesGateway],
})
export class MatchesModule {}
