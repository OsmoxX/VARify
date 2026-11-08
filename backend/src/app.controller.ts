import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service.js';
import { SportApiService } from './sport-api/sport-api.service.js';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
  ) {}

  /** Stan limitów SportAPI (ile zapytań zostało, własny budżet, ewentualna pauza). */
  @Get('quota')
  quota() {
    return this.sportApi.quotaStatus();
  }

  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'db_unavailable' });
    }
  }
}
