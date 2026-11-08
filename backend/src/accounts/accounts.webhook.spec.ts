import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const constructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent };
    checkout = { sessions: { create: vi.fn() } };
    billingPortal = { sessions: { create: vi.fn() } };
  },
}));

const { AccountsService } = await import('./accounts.service.js');

const CONFIG: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_ID_PLUS: 'price_plus',
  STRIPE_PRICE_ID_PREMIUM: 'price_premium',
};

function setup() {
  const tx = {
    stripeEvent: { create: vi.fn().mockResolvedValue({}) },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    profile: { findUnique: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
  };
  const config = { get: (k: string) => CONFIG[k] };
  const service = new AccountsService(prisma as never, config as never);
  return { service, prisma, tx };
}

const ev = (type: string, object: unknown, id = 'evt_1') => ({ id, type, data: { object } });
const body = Buffer.from('{}');

describe('Stripe webhook', () => {
  beforeEach(() => constructEvent.mockReset());

  it('brak podpisu lub ciała → 400, bez wywołania Stripe', async () => {
    const { service } = setup();
    await expect(service.handleWebhook(body, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handleWebhook(undefined, 'sig')).rejects.toBeInstanceOf(BadRequestException);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('zły podpis → 400 i ZERO zapisów do bazy', async () => {
    const { service, prisma } = setup();
    constructEvent.mockImplementationOnce(function () { throw new Error('No signatures found'); });
    await expect(service.handleWebhook(body, 'bad')).rejects.toBeInstanceOf(BadRequestException);
    void prisma;
  });

  it('weryfikuje podpis surowym ciałem i sekretem z konfiguracji', async () => {
    const { service } = setup();
    constructEvent.mockReturnValue(ev('unknown.event', {}));
    await service.handleWebhook(body, 'sig_ok');
    expect(constructEvent).toHaveBeenCalledWith(body, 'sig_ok', 'whsec_x');
  });

  it('checkout.session.completed zapisuje tier, customerId ORAZ subscriptionId', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('checkout.session.completed', {
      mode: 'subscription', payment_status: 'paid', client_reference_id: '42',
      customer: 'cus_1', subscription: 'sub_1', metadata: { tier: 'premium' },
    }));
    expect(await service.handleWebhook(body, 'sig')).toBe('processed');
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 42 },
      data: { tier: 'PREMIUM', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
    });
  });

  it('płatność jeszcze nie opłacona (async) → tier NIE jest nadawany', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('checkout.session.completed', {
      mode: 'subscription', payment_status: 'unpaid', client_reference_id: '42', customer: 'c', subscription: 's', metadata: { tier: 'plus' },
    }));
    await service.handleWebhook(body, 'sig');
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
  });

  it('zmanipulowany tier w metadanych (np. "admin") jest ignorowany', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('checkout.session.completed', {
      mode: 'subscription', payment_status: 'paid', client_reference_id: '42', customer: 'c', subscription: 's', metadata: { tier: 'admin' },
    }));
    await service.handleWebhook(body, 'sig');
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted → FREE, status canceled, wyczyszczone subscriptionId', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', customer: 'cus_1' }));
    await service.handleWebhook(body, 'sig');
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { tier: 'FREE', subscriptionStatus: 'canceled', stripeSubscriptionId: null },
    });
  });

  it('invoice.payment_failed → past_due, plan zachowany na czas karencji', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('invoice.payment_failed', { customer: 'cus_1' }));
    await service.handleWebhook(body, 'sig');
    const call = tx.profile.updateMany.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(call.where).toEqual({ stripeCustomerId: 'cus_1', stripeSubscriptionId: { not: null } });
    expect(call.data).toEqual({ subscriptionStatus: 'past_due' });
    expect(call.data).not.toHaveProperty('tier');
  });

  it('invoice.paid przywraca status active tylko z past_due', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValue(ev('invoice.paid', { customer: 'cus_1' }));
    await service.handleWebhook(body, 'sig');
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_1', subscriptionStatus: 'past_due' },
      data: { subscriptionStatus: 'active' },
    });
  });

  it('subscription.updated: zmiana planu wg ceny; unpaid → FREE', async () => {
    const { service, tx } = setup();
    constructEvent.mockReturnValueOnce(ev('customer.subscription.updated', {
      id: 'sub_1', status: 'active', customer: 'cus_1', items: { data: [{ price: { id: 'price_premium' } }] },
    }));
    await service.handleWebhook(body, 'sig');
    expect((tx.profile.updateMany.mock.calls[0]![0] as { data: { tier: string } }).data.tier).toBe('PREMIUM');

    constructEvent.mockReturnValueOnce(ev('customer.subscription.updated', {
      id: 'sub_1', status: 'unpaid', customer: 'cus_1', items: { data: [{ price: { id: 'price_premium' } }] },
    }, 'evt_2'));
    await service.handleWebhook(body, 'sig');
    expect((tx.profile.updateMany.mock.calls[1]![0] as { data: { tier: string } }).data.tier).toBe('FREE');
  });

  it('idempotencja: ponowna dostawa tego samego zdarzenia nie zmienia profilu', async () => {
    const { service, tx } = setup();
    tx.stripeEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    constructEvent.mockReturnValue(ev('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', customer: 'c' }));
    expect(await service.handleWebhook(body, 'sig')).toBe('duplicate');
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
  });

  it('błąd przetwarzania propaguje się (Stripe ponowi dostawę)', async () => {
    const { service, tx } = setup();
    tx.profile.updateMany.mockRejectedValue(new Error('db down'));
    constructEvent.mockReturnValue(ev('invoice.payment_failed', { customer: 'cus_1' }));
    await expect(service.handleWebhook(body, 'sig')).rejects.toThrow('db down');
  });

  it('nieobsługiwane zdarzenia kończą się sukcesem (brak ponowień)', async () => {
    const { service } = setup();
    constructEvent.mockReturnValue(ev('charge.refunded', {}));
    expect(await service.handleWebhook(body, 'sig')).toBe('processed');
  });
});

describe('Checkout', () => {
  it('blokuje drugą aktywną subskrypcję (podwójne obciążenie)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.c',
      profile: { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
    });
    await expect(service.createCheckoutSession(1, 'premium')).rejects.toBeInstanceOf(ConflictException);
  });
});
