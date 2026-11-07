import { Controller, Post, Delete, Param, UseGuards, Req, ParseIntPipe, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /api/notifications/matches/:matchId/toggle
   * Odpowiednik Django toggle_notifications()
   */
  @Post('matches/:matchId/toggle')
  @UseGuards(OptionalJwtGuard)
  async toggle(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Req() req: { user?: { id: number }; sessionId?: string },
  ) {
    const userId = req.user?.id ?? null;
    const sessionKey = req.sessionId ?? null;
    return this.notificationsService.toggleMatchSubscription(
      matchId,
      userId,
      sessionKey,
    );
  }

  /** GET /api/notifications/subscribed — ID meczów z aktywną subskrypcją */
  @Get('subscribed')
  @UseGuards(OptionalJwtGuard)
  async getSubscribed(
    @Req() req: { user?: { id: number }; sessionId?: string },
  ) {
    const userId = req.user?.id ?? null;
    const sessionKey = req.sessionId ?? null;
    return this.notificationsService.getSubscribedMatchIds(userId, sessionKey);
  }
}
