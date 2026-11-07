import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async toggleMatchSubscription(
    matchId: number,
    userId: number | null,
    sessionKey: string | null,
  ) {
    // Find existing subscription
    const existing = await this.prisma.matchSubscription.findFirst({
      where: {
        matchId,
        ...(userId ? { userId } : { sessionKey }),
      },
    });

    if (existing) {
      // Toggle active state
      const updated = await this.prisma.matchSubscription.update({
        where: { id: existing.id },
        data: { isActive: !existing.isActive },
      });
      return { subscribed: updated.isActive, matchId };
    }

    // Create new subscription
    await this.prisma.matchSubscription.create({
      data: { matchId, userId, sessionKey, isActive: true },
    });
    return { subscribed: true, matchId };
  }

  async getSubscribedMatchIds(
    userId: number | null,
    sessionKey: string | null,
  ): Promise<number[]> {
    const subs = await this.prisma.matchSubscription.findMany({
      where: {
        isActive: true,
        ...(userId ? { userId } : { sessionKey }),
      },
      select: { matchId: true },
    });
    return subs.map((s) => s.matchId);
  }
}
