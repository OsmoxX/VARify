import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller.js';
import { PlayersService } from './players.service.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [PlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
