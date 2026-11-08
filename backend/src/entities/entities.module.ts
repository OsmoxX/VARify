import { Global, Module } from '@nestjs/common';
import { EntitiesService } from './entities.service.js';

@Global()
@Module({ providers: [EntitiesService], exports: [EntitiesService] })
export class EntitiesModule {}
