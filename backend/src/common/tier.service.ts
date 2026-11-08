import { Injectable } from '@nestjs/common';
import type { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TierService {
  constructor(private readonly prisma: PrismaService) {}

  /** Plan użytkownika (FREE dla gości i kont bez profilu). */
  async tierOf(userId: number | null | undefined): Promise<SubscriptionTier> {
    if (!userId) return 'FREE';
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { tier: true } });
    return p?.tier ?? 'FREE';
  }
}
