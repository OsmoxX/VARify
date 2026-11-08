import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

/**
 * Tworzenie/odnajdywanie lig i drużyn z cache'em ID w pamięci.
 * Sync live co minutę dotykał ligi i drużyny każdego meczu (3 upserty × ~200 meczów);
 * ID nigdy się nie zmieniają, więc po pierwszym razie zapytanie jest zbędne.
 * Wyścig przy równoległym tworzeniu (P2002) jest obsłużony ponownym odczytem.
 */
@Injectable()
export class EntitiesService {
  private readonly leagueIds = new Map<string, number>();
  private readonly teamIds = new Map<number, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Wywoływane, gdy zapis trafi na nieistniejący klucz obcy (rekord usunięty spod cache'u). */
  clearCache(): void {
    this.leagueIds.clear();
    this.teamIds.clear();
  }

  async ensureLeague(apiId: string, name: string, country?: string | null): Promise<number> {
    const cached = this.leagueIds.get(apiId);
    if (cached) return cached;
    const data = { name: name.slice(0, 255), country: country ? country.slice(0, 100) : null };
    let id: number;
    try {
      const row = await this.prisma.league.upsert({
        where: { apiId },
        create: { apiId, ...data },
        update: { name: data.name, ...(data.country ? { country: data.country } : {}) },
        select: { id: true },
      });
      id = row.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      id = (await this.prisma.league.findUniqueOrThrow({ where: { apiId }, select: { id: true } })).id;
    }
    this.leagueIds.set(apiId, id);
    return id;
  }

  async ensureTeam(apiId: number, name: string): Promise<number> {
    const cached = this.teamIds.get(apiId);
    if (cached) return cached;
    let id: number;
    try {
      const row = await this.prisma.team.upsert({
        where: { apiId },
        create: { apiId, name: name.slice(0, 255) },
        update: { name: name.slice(0, 255) },
        select: { id: true },
      });
      id = row.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      id = (await this.prisma.team.findUniqueOrThrow({ where: { apiId }, select: { id: true } })).id;
    }
    this.teamIds.set(apiId, id);
    return id;
  }
}
