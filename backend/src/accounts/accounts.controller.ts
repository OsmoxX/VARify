import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AccountsService } from './accounts.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { ChangePasswordDto, CheckoutDto, UpdateProfileDto } from './dto.js';
import { planToTier } from './subscription-state.js';

@Controller('stripe')
export class StripeController {
  constructor(private readonly accounts: AccountsService) {}

  /** POST /api/stripe/checkout/:plan  (plus | premium) → { url } */
  @Post('checkout/:plan')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @Param('plan') plan: string,
    @CurrentUser() user: AuthUser | null,
    @Body() body: CheckoutDto,
  ) {
    if (!planToTier(plan)) throw new BadRequestException('Invalid plan');
    return { url: await this.accounts.createCheckoutSession(user!.id, plan as 'plus' | 'premium', body.locale) };
  }

  /** POST /api/stripe/portal → { url } (zarządzanie / anulowanie subskrypcji) */
  @Post('portal')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async portal(@CurrentUser() user: AuthUser | null) {
    return { url: await this.accounts.createPortalSession(user!.id) };
  }

  /**
   * POST /api/stripe/webhook — publiczny, chroniony wyłącznie podpisem `stripe-signature`.
   * 400 = zły podpis; 5xx = błąd przetwarzania (Stripe ponowi dostawę).
   */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    const result = await this.accounts.handleWebhook(req.rawBody, signature);
    return { received: true, result };
  }
}

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser | null) {
    return this.accounts.getAccount(user!.id);
  }

  @Patch('profile')
  update(@CurrentUser() user: AuthUser | null, @Body() dto: UpdateProfileDto) {
    return this.accounts.updateProfile(user!.id, dto);
  }

  @Post('password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async password(@CurrentUser() user: AuthUser | null, @Body() dto: ChangePasswordDto) {
    await this.accounts.changePassword(user!.id, dto.currentPassword, dto.newPassword);
  }
}
