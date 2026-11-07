import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [CalendarController],
})
export class CalendarModule {}
