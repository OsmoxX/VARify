import { Body, Controller, Get, Header, HttpCode, Param, ParseIntPipe, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, GuestId, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  /** POST /api/notifications/matches/:matchId/toggle  (matchId = lokalne id meczu) */
  @Post('matches/:matchId/toggle')
  @HttpCode(200)
  @UseGuards(OptionalJwtGuard)
  toggle(
    @Param('matchId', ParseIntPipe) matchId: number,
    @CurrentUser() user: AuthUser | null,
    @GuestId() guestId: string | null,
  ) {
    return this.notifications.toggleMatchSubscription(matchId, user?.id ?? null, guestId);
  }

  /** GET /api/notifications/subscribed */
  @Get('subscribed')
  @UseGuards(OptionalJwtGuard)
  @Header('Cache-Control', 'no-store')
  subscribed(@CurrentUser() user: AuthUser | null, @GuestId() guestId: string | null) {
    return this.notifications.getSubscribed(user?.id ?? null, guestId);
  }

  @Get('push/public-key')
  publicKey() {
    const key = this.push.getPublicKey();
    if (!key) throw new ServiceUnavailableException('Web Push is not configured');
    return { publicKey: key };
  }

  @Post('push/subscribe')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async subscribePush(@CurrentUser() user: AuthUser | null, @Body() dto: PushSubscribeDto) {
    await this.push.subscribe(user!.id, dto.endpoint, dto.keys.p256dh, dto.keys.auth);
  }

  @Post('push/unsubscribe')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async unsubscribePush(@CurrentUser() user: AuthUser | null, @Body() dto: PushUnsubscribeDto) {
    await this.push.unsubscribe(user!.id, dto.endpoint);
  }
}
