import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REQUIRED_TIER_KEY } from '../decorators/require-tier.decorator.js';
import { hasAccess } from '../utils/tier.js';

/**
 * TierGuard — odpowiednik Django @require_tier.
 * Tier jest czytany z bazy przy każdym żądaniu (nie z JWT), żeby downgrade
 * po webhooku Stripe działał natychmiast, a nie dopiero po wygaśnięciu tokenu.
 * Odpowiedź 403 ma ten sam kształt co Django (error/message/required_tier/upgrade_url).
 */
@Injectable()
export class TierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SubscriptionTier | undefined>(
      REQUIRED_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required === 'FREE') return true;

    const req = context.switchToHttp().getRequest<{ user?: { id: number } | null }>();
    if (!req.user) throw new UnauthorizedException();

    const profile = await this.prisma.profile.findUnique({
      where: { userId: req.user.id },
      select: { tier: true },
    });
    if (!hasAccess(profile?.tier, required)) {
      throw new ForbiddenException({
        error: 'access_denied',
        message: `This feature requires the ${required} plan.`,
        required_tier: required,
        upgrade_url: '/subscribe',
      });
    }
    return true;
  }
}
