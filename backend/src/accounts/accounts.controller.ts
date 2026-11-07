import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  Headers,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountsService } from './accounts.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@Controller('stripe')
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name);

  constructor(private readonly accountsService: AccountsService) {}

  /**
   * POST /api/stripe/checkout/:plan
   * Odpowiednik Django create_checkout_session()
   */
  @Post('checkout/:plan')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @Param('plan') plan: string,
    @Req() req: { user: { id: number } },
  ) {
    if (!['plus', 'premium'].includes(plan)) {
      return { error: 'Invalid plan' };
    }
    const url = await this.accountsService.createCheckoutSession(
      req.user.id,
      plan as 'plus' | 'premium',
    );
    return { url };
  }

  /**
   * POST /api/stripe/webhook
   * Odpowiednik Django stripe_webhook()
   * FIX BUG #7: zapisuje ZARÓWNO stripe_customer_id JAK I stripe_subscription_id
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    try {
      await this.accountsService.handleWebhook(
        req.rawBody as Buffer,
        signature,
      );
      res.status(200).send('OK');
    } catch (err: unknown) {
      this.logger.error('Stripe webhook error', err);
      res.status(400).send('Webhook error');
    }
  }
}
