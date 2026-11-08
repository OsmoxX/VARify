import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../entities/entities.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Przełącza dzwoneczek ATOMOWO.
   *
   * Poprzednia wersja robiła find → update(!isActive) / create. Dwa równoczesne kliknięcia
   * (podwójne kliknięcie, dwie karty) czytały ten sam stan i zapisywały tę samą wartość
   * (efekt: jedno przełączenie zamiast dwóch) albo tworzyły duplikaty subskrypcji.
   * Teraz: unikalne (userId, matchId) / (sessionKey, matchId) + pojedynczy
   * `INSERT … ON DUPLICATE KEY UPDATE isActive = NOT isActive`.
   */
  async toggleMatchSubscription(
    matchId: number,
    userId: number | null,
    guestId: string | null,
  ): Promise<{ subscribed: boolean; matchId: number }> {
    if (!userId && !guestId) {
      throw new BadRequestException('Missing identity: log in or send a valid X-Guest-Id header');
    }
    const match = await this.prisma.liveMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    if (userId && guestId) await this.mergeGuestSubscription(userId, guestId, matchId);

    if (userId) {
      await this.prisma.$executeRaw`
        INSERT INTO match_subscriptions (matchId, userId, sessionKey, isActive, createdAt)
        VALUES (${matchId}, ${userId}, NULL, 1, UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE isActive = NOT isActive`;
      const sub = await this.prisma.matchSubscription.findUnique({
        where: { userId_matchId: { userId, matchId } },
        select: { isActive: true },
      });
      return { subscribed: sub?.isActive ?? false, matchId };
    }

    await this.prisma.$executeRaw`
      INSERT INTO match_subscriptions (matchId, userId, sessionKey, isActive, createdAt)
      VALUES (${matchId}, NULL, ${guestId}, 1, UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE isActive = NOT isActive`;
    const sub = await this.prisma.matchSubscription.findUnique({
      where: { sessionKey_matchId: { sessionKey: guestId as string, matchId } },
      select: { isActive: true },
    });
    return { subscribed: sub?.isActive ?? false, matchId };
  }

  /** Subskrypcja gościa → konto po zalogowaniu (Django: merge guest_sub). */
  private async mergeGuestSubscription(userId: number, guestId: string, matchId: number) {
    const guest = await this.prisma.matchSubscription.findUnique({
      where: { sessionKey_matchId: { sessionKey: guestId, matchId } },
    });
    if (!guest || guest.userId) return;
    try {
      const mine = await this.prisma.matchSubscription.findUnique({
        where: { userId_matchId: { userId, matchId } },
        select: { id: true },
      });
      if (mine) await this.prisma.matchSubscription.delete({ where: { id: guest.id } });
      else await this.prisma.matchSubscription.update({ where: { id: guest.id }, data: { userId } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // równoległe scalenie — drugi request wygrał
    }
  }

  /** Aktywne subskrypcje: konto + (jeśli podano) niescalone subskrypcje gościa. */
  async getSubscribed(userId: number | null, guestId: string | null) {
    const or = [
      ...(userId ? [{ userId }] : []),
      ...(guestId ? [{ userId: null, sessionKey: guestId }] : []),
    ];
    if (or.length === 0) return { matchIds: [] as number[], matchApiIds: [] as number[] };
    const subs = await this.prisma.matchSubscription.findMany({
      where: { isActive: true, OR: or },
      select: { matchId: true, match: { select: { apiId: true } } },
    });
    return {
      matchIds: subs.map((s) => s.matchId),
      matchApiIds: subs.map((s) => s.match.apiId),
    };
  }
}
