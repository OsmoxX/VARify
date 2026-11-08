import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarService } from './calendar.service.js';
import { groupByLeague } from '../common/utils/group.js';
import { dayBoundsUtc, isValidIsoDate, isValidTimeZone, todayIn } from '../common/utils/timezone.js';

export class CalendarQueryDto {
  /** YYYY-MM-DD — dzień kalendarzowy w strefie `tz` */
  @IsOptional() @IsString() @MaxLength(10) date?: string;
  /** IANA, np. Europe/Warsaw (domyślnie UTC) */
  @IsOptional() @IsString() @MaxLength(64) tz?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,10}$/) league?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  top?: boolean;
}

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
  ) {}

  /**
   * GET /api/calendar?date=2026-11-07&tz=Europe/Warsaw
   * "Dzień" to dzień lokalny użytkownika: granice liczymy w jego strefie i konwertujemy do UTC,
   * więc mecz o 23:30 UTC trafia do właściwego dnia w Warszawie / Nowym Jorku.
   */
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async day(@Query() q: CalendarQueryDto) {
    const tz = q.tz ?? 'UTC';
    if (!isValidTimeZone(tz)) throw new BadRequestException('Invalid time zone');
    const date = q.date ?? todayIn(tz);
    if (!isValidIsoDate(date)) throw new BadRequestException('date must be YYYY-MM-DD');

    const { start, end } = dayBoundsUtc(date, tz);
    await this.calendar.ensureRange(start, end);

    const rows = await this.prisma.upcomingMatch.findMany({
      where: {
        startDatetime: { gte: start, lt: end },
        ...(q.league ? { league: { apiId: q.league } } : {}),
        ...(q.top ? { isTop: true } : {}),
      },
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: [{ startDatetime: 'asc' }, { id: 'asc' }],
    });

    const matches = rows.map((m) => ({
      id: m.id,
      apiId: m.apiId,
      league: m.league,
      isTop: m.isTop,
      startDatetime: m.startDatetime ? m.startDatetime.toISOString() : null,
      homeTeam: m.homeTeam && { id: m.homeTeam.id, apiId: m.homeTeam.apiId, name: m.homeTeam.name },
      awayTeam: m.awayTeam && { id: m.awayTeam.id, apiId: m.awayTeam.apiId, name: m.awayTeam.name },
    }));

    return { date, tz, leagues: groupByLeague(matches), total: matches.length };
  }
}
