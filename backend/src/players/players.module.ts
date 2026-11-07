import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [PlayersController],
})
export class PlayersModule {}
