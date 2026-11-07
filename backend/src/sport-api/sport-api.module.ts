import { Module } from '@nestjs/common';
import { SportApiService } from './sport-api.service.js';

@Module({
  providers: [SportApiService],
  exports: [SportApiService],
})
export class SportApiModule {}
