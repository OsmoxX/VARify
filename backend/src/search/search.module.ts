import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';
import { PlayersModule } from '../players/players.module.js';

@Module({ imports: [SportApiModule, PlayersModule], controllers: [SearchController] })
export class SearchModule {}
