import { Module } from '@nestjs/common';
import { LeaguesController } from './leagues.controller.js';
import { StandingsService } from './standings.service.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [LeaguesController],
  providers: [StandingsService],
  exports: [StandingsService],
})
export class LeaguesModule {}
