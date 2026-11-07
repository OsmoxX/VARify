import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [TeamsController],
})
export class TeamsModule {}
