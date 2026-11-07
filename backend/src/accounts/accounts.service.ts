import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import Stripe from 'stripe';

export type PlanName = 'plus' | 'premium';

/**
 * AccountsService — Stripe subscriptions
 * FIX BUG #7: przy checkout.session.completed zapisujemy
 *   ZARÓWNO stripeCustomerId JAK I stripeSubscriptionId.
 */
@Injectable()
export class AccountsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2026-10-28.endive' as unknown as Stripe.LatestApiVersion },
    );
  }

  async createCheckoutSession(
    userId: number,
    plan: PlanName,
  ): Promise<string> {
    const priceId = plan === 'plus'
      ? this.config.getOrThrow<string>('STRIPE_PRICE_ID_PLUS')
      : this.config.getOrThrow<string>('STRIPE_PRICE_ID_PREMIUM');

    const session = await this.stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/?payment=success`,
      cancel_url: `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/subscribe?payment=cancelled`,
      client_reference_id: String(userId),
      metadata: { tier: plan },
    });

    return session.url ?? '';
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: unknown) {
      this.logger.warn('Stripe signature verification failed', err);
      throw err;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id
        ? parseInt(session.client_reference_id)
        : null;
      const tierPurchased = session.metadata?.['tier'] as PlanName | undefined;

      if (!userId || !tierPurchased) {
        this.logger.warn('Missing userId or tier in Stripe session');
        return;
      }

      const tier = tierPurchased === 'plus' ? 'PLUS' : 'PREMIUM';

      // FIX BUG #7: zapisujemy ZARÓWNO customerId JAK I subscriptionId
      await this.prisma.profile.update({
        where: { userId },
        data: {
          tier: tier as 'PLUS' | 'PREMIUM',
          stripeCustomerId: session.customer as string | null,
          stripeSubscriptionId: session.subscription as string | null, // ← BUG #7 FIX
        },
      });

      this.logger.log(
        `✅ User ${userId} upgraded to ${tier} (sub: ${session.subscription})`,
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      await this.prisma.profile.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { tier: 'FREE' },
      });
      this.logger.log(`Subscription ${sub.id} cancelled → user downgraded to FREE`);
    }
  }

  async getProfile(userId: number) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }
}
