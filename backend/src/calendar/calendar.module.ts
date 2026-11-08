import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({
  imports: [SportApiModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
