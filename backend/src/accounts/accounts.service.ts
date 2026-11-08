import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, SubscriptionTier } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../entities/entities.service.js';
import { hasAccess } from '../common/utils/tier.js';
import {
  ACTIVE_STATUSES,
  type PlanName,
  idOf,
  parseUserId,
  planToTier,
  tierForSubscription,
} from './subscription-state.js';

type Tx = Prisma.TransactionClient;

interface CheckoutSessionLike {
  mode?: string;
  payment_status?: string;
  client_reference_id?: string | null;
  customer?: unknown;
  subscription?: unknown;
  metadata?: Record<string, string> | null;
}
interface SubscriptionLike {
  id: string;
  status: string;
  customer?: unknown;
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ price?: { id?: string } }> };
}
interface InvoiceLike {
  customer?: unknown;
}

@Injectable()
export class AccountsService {
  private stripeClient: Stripe | null = null;
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get stripe(): Stripe {
    if (!this.stripeClient) {
      const key = this.config.get<string>('STRIPE_SECRET_KEY');
      if (!key) throw new ServiceUnavailableException('Payments are not configured');
      this.stripeClient = new Stripe(key);
    }
    return this.stripeClient;
  }

  private get frontendUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').split(',')[0]!.trim();
  }

  // ===========================================================================
  //  Konto
  // ===========================================================================

  async getAccount(userId: number) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, username: true, createdAt: true, profile: true },
    });
    const tier = u.profile?.tier ?? 'FREE';
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      tier,
      subscriptionStatus: u.profile?.subscriptionStatus ?? null,
      hasBillingPortal: !!u.profile?.stripeCustomerId,
      canChangeUsername: hasAccess(tier, 'PLUS'),
      createdAt: u.createdAt.toISOString(),
    };
  }

  /** Zmiana nazwy użytkownika tylko dla PLUS/PREMIUM (Django: FREE → readonly, wymuszane też w backendzie). */
  async updateProfile(userId: number, dto: { email?: string; username?: string }) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, profile: { select: { tier: true } } },
    });
    const data: Prisma.UserUpdateInput = {};
    if (dto.username !== undefined && dto.username !== current.username) {
      if (!hasAccess(current.profile?.tier, 'PLUS')) {
        throw new ForbiddenException({
          error: 'access_denied',
          message: 'Changing the username requires the PLUS plan.',
          required_tier: 'PLUS',
          upgrade_url: '/subscribe',
        });
      }
      data.username = dto.username;
    }
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (Object.keys(data).length === 0) return this.getAccount(userId);
    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Email or username is already taken');
      throw err;
    }
    return this.getAccount(userId);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { password: true } });
    if (!user.password || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 12) } });
  }

  // ===========================================================================
  //  Stripe: Checkout + Portal
  // ===========================================================================

  async createCheckoutSession(userId: number, plan: PlanName, locale?: 'pl' | 'en'): Promise<string> {
    const priceId = this.config.get<string>(plan === 'plus' ? 'STRIPE_PRICE_ID_PLUS' : 'STRIPE_PRICE_ID_PREMIUM');
    if (!priceId) throw new ServiceUnavailableException('Payments are not configured');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, profile: true },
    });
    const p = user.profile;
    // Druga aktywna subskrypcja = podwójne obciążenie. Zmiana planu idzie przez Customer Portal.
    if (p?.stripeSubscriptionId && p.subscriptionStatus && ACTIVE_STATUSES.has(p.subscriptionStatus)) {
      throw new ConflictException({
        error: 'already_subscribed',
        message: 'You already have an active subscription. Manage or change it in the billing portal.',
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.frontendUrl}/?payment=success`,
      cancel_url: `${this.frontendUrl}/subscribe?payment=cancelled`,
      client_reference_id: String(userId),
      metadata: { tier: plan },
      subscription_data: { metadata: { userId: String(userId), tier: plan } },
      ...(p?.stripeCustomerId ? { customer: p.stripeCustomerId } : { customer_email: user.email }),
      locale: locale ?? 'auto',
    });
    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    return session.url;
  }

  async createPortalSession(userId: number): Promise<string> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile?.stripeCustomerId) throw new NotFoundException('No billing account yet');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${this.frontendUrl}/account`,
    });
    return session.url;
  }

  // ===========================================================================
  //  Stripe: Webhook
  // ===========================================================================

  /**
   * Weryfikuje podpis (`stripe-signature` + surowe ciało) i przetwarza zdarzenie idempotentnie:
   * id zdarzenia zapisywane jest w tej samej transakcji co zmiana planu, więc ponowna dostawa
   * (Stripe ponawia) nie wykona się drugi raz, a błąd w połowie nie "zużywa" zdarzenia.
   */
  async handleWebhook(payload: Buffer | undefined, signature: string | undefined): Promise<'processed' | 'duplicate'> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Webhook secret is not configured');
    if (!payload || !signature) throw new BadRequestException('Missing payload or stripe-signature header');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      this.logger.warn(`Stripe signature verification failed: ${String(err)}`);
      throw new BadRequestException('Invalid signature');
    }

    let duplicate = false;
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
      } catch (err) {
        if (isUniqueViolation(err)) {
          duplicate = true;
          return;
        }
        throw err;
      }
      await this.applyEvent(tx, event);
    });
    return duplicate ? 'duplicate' : 'processed';
  }

  private priceTier(sub: SubscriptionLike): SubscriptionTier | undefined {
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (priceId && priceId === this.config.get<string>('STRIPE_PRICE_ID_PLUS')) return 'PLUS';
    if (priceId && priceId === this.config.get<string>('STRIPE_PRICE_ID_PREMIUM')) return 'PREMIUM';
    return planToTier(sub.metadata?.['tier']);
  }

  private async applyEvent(tx: Tx, event: Stripe.Event): Promise<void> {
    const object = event.data.object as unknown;
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = object as CheckoutSessionLike;
        if (s.mode && s.mode !== 'subscription') return;
        // Płatność asynchroniczna (np. SEPA): tier nadajemy dopiero po subscription.updated/invoice.paid
        if (s.payment_status && !['paid', 'no_payment_required'].includes(s.payment_status)) return;
        const userId = parseUserId(s.client_reference_id);
        const tier = planToTier(s.metadata?.['tier']);
        if (!userId || !tier) {
          this.logger.warn(`checkout.session.completed ${event.id}: missing userId/tier`);
          return;
        }
        const { count } = await tx.profile.updateMany({
          where: { userId },
          data: {
            tier,
            stripeCustomerId: idOf(s.customer),
            stripeSubscriptionId: idOf(s.subscription),
            subscriptionStatus: 'active',
          },
        });
        if (count === 0) this.logger.warn(`checkout.session.completed: no profile for user ${userId}`);
        else this.logger.log(`User ${userId} upgraded to ${tier}`);
        return;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = object as SubscriptionLike;
        const customerId = idOf(sub.customer);
        const metaUser = parseUserId(sub.metadata?.['userId']);
        const tier = tierForSubscription(sub.status, this.priceTier(sub));
        const owner: Prisma.ProfileWhereInput = metaUser
          ? { userId: metaUser }
          : { stripeCustomerId: customerId ?? '__none__' };
        await tx.profile.updateMany({
          // nie nadpisuj stanu nowszą subskrypcją starą (zdarzenia mogą przyjść poza kolejnością)
          where: { AND: [owner, { OR: [{ stripeSubscriptionId: sub.id }, { stripeSubscriptionId: null }] }] },
          data: {
            ...(tier ? { tier } : {}),
            subscriptionStatus: sub.status,
            stripeSubscriptionId: sub.id,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          },
        });
        return;
      }

      case 'customer.subscription.deleted': {
        const sub = object as SubscriptionLike;
        const { count } = await tx.profile.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { tier: 'FREE', subscriptionStatus: 'canceled', stripeSubscriptionId: null },
        });
        this.logger.log(`Subscription ${sub.id} deleted → ${count} profile(s) downgraded to FREE`);
        return;
      }

      case 'invoice.payment_failed': {
        const customerId = idOf((object as InvoiceLike).customer);
        if (!customerId) return;
        // Plan zostaje na czas karencji; ostateczne odcięcie robi subscription.updated/deleted.
        await tx.profile.updateMany({
          where: { stripeCustomerId: customerId, stripeSubscriptionId: { not: null } },
          data: { subscriptionStatus: 'past_due' },
        });
        this.logger.warn(`Payment failed for customer ${customerId} → past_due`);
        return;
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const customerId = idOf((object as InvoiceLike).customer);
        if (!customerId) return;
        await tx.profile.updateMany({
          where: { stripeCustomerId: customerId, subscriptionStatus: 'past_due' },
          data: { subscriptionStatus: 'active' },
        });
        return;
      }

      default:
        return; // nieobsługiwane zdarzenia potwierdzamy 200 (bez ponownych prób)
    }
  }
}
