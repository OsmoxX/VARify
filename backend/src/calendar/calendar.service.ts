import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { EntitiesService } from '../entities/entities.service.js';
import { LockService } from '../common/lock/lock.service.js';
import { type Json, arr, num, obj, str } from '../common/utils/json.js';
import { addDays, unixToDate } from '../common/utils/timezone.js';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly entities: EntitiesService,
    private readonly lock: LockService,
  ) {}

  /** Daty UTC (YYYY-MM-DD) pokrywające przedział [start, end). */
  static utcDatesCovering(start: Date, end: Date): string[] {
    const first = start.toISOString().slice(0, 10);
    const last = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    const out = [first];
    for (let d = first; d !== last && out.length < 4; ) {
      d = addDays(d, 1);
      out.push(d);
    }
    return out;
  }

  /** Pobiera i zapisuje nadchodzące mecze dla podanych dat. Zwraca liczbę zapisanych. */
  async syncDates(dates: string[]): Promise<number> {
    let saved = 0;
    for (const date of dates) {
      const data = await this.sportApi.fetchScheduledEvents(date);
      if (!data) continue;
      for (const event of arr(data['events'])) {
        try {
          if (await this.upsertUpcoming(event)) saved++;
        } catch (err) {
          this.logger.warn(`calendar skip ${str(event['id']) ?? '?'}: ${String(err)}`);
        }
      }
    }
    return saved;
  }

  private async upsertUpcoming(event: Json): Promise<boolean> {
    // Tylko mecze, które się jeszcze nie zaczęły (Django: status.type == "notstarted")
    if (str(obj(event['status'])['type']) !== 'notstarted') return false;

    const apiId = num(event['id']);
    const start = unixToDate(event['startTimestamp']); // UTC, bez sztywnego +2h
    const tournament = obj(event['tournament']);
    const unique = obj(tournament['uniqueTournament']);
    const leagueApiId = str(unique['id']) ?? str(tournament['id']);
    const home = obj(event['homeTeam']);
    const away = obj(event['awayTeam']);
    const homeId = num(home['id']);
    const awayId = num(away['id']);
    if (apiId === null || !start || !leagueApiId || homeId === null || awayId === null) return false;

    const [leagueId, homeTeamId, awayTeamId] = await Promise.all([
      this.entities.ensureLeague(
        leagueApiId,
        str(unique['name']) ?? str(tournament['name']) ?? 'Unknown league',
        str(obj(tournament['category'])['name']),
      ),
      this.entities.ensureTeam(homeId, str(home['name']) ?? 'Home'),
      this.entities.ensureTeam(awayId, str(away['name']) ?? 'Away'),
    ]);

    const data = {
      leagueId,
      homeTeamId,
      awayTeamId,
      startDatetime: start,
      isTop: SportApiService.isTopLeague(leagueApiId),
    };
    await this.prisma.upcomingMatch.upsert({
      where: { apiId },
      create: { apiId, ...data },
      update: data,
    });
    return true;
  }

  /** Usuwa mecze starsze niż doba (Django: sprzed dzisiejszej daty). */
  async purgeOld(): Promise<number> {
    const { count } = await this.prisma.upcomingMatch.deleteMany({
      where: { startDatetime: { lt: new Date(Date.now() - 24 * 3600_000) } },
    });
    return count;
  }

  /** Cron: dziś + 4 kolejne dni (UTC). */
  async syncUpcomingWindow(days = 5): Promise<number> {
    const token = await this.lock.acquire('calendar-sync-window', 10 * 60_000);
    if (!token) return 0;
    try {
      await this.purgeOld();
      const today = new Date().toISOString().slice(0, 10);
      const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
      return await this.syncDates(dates);
    } finally {
      await this.lock.release('calendar-sync-window', token);
    }
  }

  /**
   * Na żądanie: jeśli w DB brak meczów dla przedziału, dociąga z API (throttling 5 min na
   * zestaw dat — pusty dzień nie może wywoływać zapytań przy każdym odświeżeniu).
   */
  async ensureRange(start: Date, end: Date): Promise<void> {
    const count = await this.prisma.upcomingMatch.count({
      where: { startDatetime: { gte: start, lt: end } },
    });
    if (count > 0) return;
    const dates = CalendarService.utcDatesCovering(start, end);
    const key = `calendar-fetch:${dates.join(',')}`;
    if (!(await this.lock.acquire(key, 5 * 60_000))) return;
    await this.syncDates(dates);
  }
}
