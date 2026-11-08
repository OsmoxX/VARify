import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller.js';
import { TeamsModule } from '../teams/teams.module.js';

@Module({ imports: [TeamsModule], controllers: [FavoritesController] })
export class FavoritesModule {}
