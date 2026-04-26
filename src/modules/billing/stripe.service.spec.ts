import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { StripeService } from './stripe.service';
import { WorkspaceSubscription } from './entities/workspace-subscription.entity';
import { UsageRecord } from './entities/usage-record.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../workspaces/entities/workspace-user.entity';
import { MailService } from '../../common/mail/mail.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRepo = () => ({
  find:       jest.fn(),
  findOne:    jest.fn(),
  findOneOrFail: jest.fn(),
  create:     jest.fn((v: any) => v),
  save:       jest.fn(async (v: any) => ({ id: 'sub-uuid', ...v })),
  update:     jest.fn(),
  upsert:     jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    insert:  jest.fn().mockReturnThis(),
    into:    jest.fn().mockReturnThis(),
    values:  jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  })),
});

const WS_A = 'workspace-a-uuid';
const CUSTOMER_ID  = 'cus_test123';
const PRICE_PRO    = 'price_pro_test';
const SUB_ID       = 'sub_test123';

// Silence ioredis connection attempts (Redis del is called in webhook handlers)
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  }));
});

// StripeSDK is loaded via require('stripe') in the service — mock it
jest.mock('stripe', () => {
  const mCheckout       = { sessions: { create: jest.fn() } };
  const mSubscriptions  = { retrieve: jest.fn(), update: jest.fn() };
  const mCustomers      = { create: jest.fn() };
  const mWebhooks       = { constructEvent: jest.fn() };
  const mSubItems       = { createUsageRecord: jest.fn() };

  const MockStripe = jest.fn().mockImplementation(() => ({
    checkout:          mCheckout,
    subscriptions:     mSubscriptions,
    customers:         mCustomers,
    webhooks:          mWebhooks,
    subscriptionItems: mSubItems,
  }));

  // Support both default import and require() usage
  MockStripe.default = MockStripe;
  return MockStripe;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StripeService', () => {
  let service: StripeService;
  let subRepo: ReturnType<typeof mockRepo>;
  let workspaceRepo: ReturnType<typeof mockRepo>;
  let workspaceUserRepo: ReturnType<typeof mockRepo>;
  let usageRepo: ReturnType<typeof mockRepo>;
  let mailService: { sendMail: jest.Mock };
  let gateway: { sendToWorkspace: jest.Mock };
  let stripeInstance: any;

  beforeEach(async () => {
    subRepo          = mockRepo();
    workspaceRepo    = mockRepo();
    workspaceUserRepo = mockRepo();
    usageRepo        = mockRepo();
    mailService      = { sendMail: jest.fn().mockResolvedValue(undefined) };
    gateway          = { sendToWorkspace: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const map: Record<string, string> = {
                STRIPE_SECRET_KEY:        'sk_test_dummy',
                STRIPE_WEBHOOK_SECRET:    'whsec_test',
                STRIPE_PRICE_STARTER:     'price_starter_test',
                STRIPE_PRICE_PRO:         PRICE_PRO,
                STRIPE_PRICE_ENTERPRISE:  'price_enterprise_test',
              };
              return map[key] ?? 'dummy';
            }),
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                STRIPE_PRICE_PRO: PRICE_PRO,
              };
              return map[key];
            }),
          },
        },
        { provide: getRepositoryToken(WorkspaceSubscription), useValue: subRepo },
        { provide: getRepositoryToken(UsageRecord),           useValue: usageRepo },
        { provide: getRepositoryToken(Workspace),             useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceUser),         useValue: workspaceUserRepo },
        { provide: MailService,           useValue: mailService },
        { provide: DataSource,            useValue: { query: jest.fn() } },
        { provide: 'NOTIFICATION_GATEWAY', useValue: gateway },
      ],
    }).compile();

    service = module.get(StripeService);
    stripeInstance = (service as any).stripe;
  });

  // ── createCheckoutSession ─────────────────────────────────────────────────

  it('returns a checkout url and creates workspace_subscriptions row', async () => {
    subRepo.findOne.mockResolvedValue(null); // no existing customer
    workspaceRepo.findOneOrFail.mockResolvedValue({ id: WS_A, name: 'Acme' });
    stripeInstance.customers.create.mockResolvedValue({ id: CUSTOMER_ID });
    stripeInstance.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test_abc',
    });

    const result = await service.createCheckoutSession(
      WS_A,
      PRICE_PRO,
      'https://app.local/success',
      'https://app.local/cancel',
    );

    expect(result.url).toBe('https://checkout.stripe.com/pay/cs_test_abc');
    // getOrCreateCustomer inserts via createQueryBuilder().insert().orIgnore()
    const qb = subRepo.createQueryBuilder.mock.results[0]?.value;
    expect(qb?.values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A, stripeCustomerId: CUSTOMER_ID }),
    );
  });

  // ── Webhook: checkout.session.completed → plan updated to pro ────────────

  it('checkout.session.completed sets plan=pro on workspace', async () => {
    const mockSub = {
      id: SUB_ID,
      items: { data: [{ price: { id: PRICE_PRO } }] },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end:   Math.floor(Date.now() / 1000) + 2592000,
    };
    stripeInstance.subscriptions.retrieve.mockResolvedValue(mockSub);
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { workspaceId: WS_A },
          customer: CUSTOMER_ID,
          subscription: SUB_ID,
        },
      },
    });

    await service.handleWebhook(Buffer.from('{}'), 'sig_test');

    // processEvent is async via setImmediate — flush it
    await new Promise((r) => setImmediate(r));

    expect(workspaceRepo.update).toHaveBeenCalledWith(
      { id: WS_A },
      { plan: 'pro' },
    );
  });

  // ── Webhook: invoice.payment_failed → past_due + notification ────────────

  it('invoice.payment_failed sets past_due and emits workspace notification', async () => {
    // subRepo.findOne used twice: once for workspaceIdByCustomer, once is not needed
    subRepo.findOne.mockResolvedValue({ workspaceId: WS_A, stripeCustomerId: CUSTOMER_ID });
    subRepo.update.mockResolvedValue({});
    workspaceUserRepo.find.mockResolvedValue([
      { user: { email: 'admin@acme.com' }, role: 'admin', status: 'active' },
    ]);
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: CUSTOMER_ID } },
    });

    await service.handleWebhook(Buffer.from('{}'), 'sig_test');
    // Wait two microtask ticks: one for setImmediate, one for async chain inside processEvent
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(subRepo.update).toHaveBeenCalledWith(
      { workspaceId: WS_A },
      { status: 'past_due' },
    );
    expect(gateway.sendToWorkspace).toHaveBeenCalledWith(
      WS_A,
      expect.objectContaining({ type: 'billing.payment_failed' }),
    );
  });

  // ── Webhook: invalid signature → BadRequestException ─────────────────────

  it('throws BadRequestException on invalid webhook signature', async () => {
    stripeInstance.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'bad_sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── enforcePlan: past_due blocks writes, allows reads ───────────────────
  // Use distinct workspace IDs so the instance-level plan cache doesn't bleed between tests.

  it('past_due blocks write requests with 402', async () => {
    const WS_PAST_DUE = 'ws-past-due-uuid';
    subRepo.findOne.mockResolvedValue({ workspaceId: WS_PAST_DUE, status: 'past_due' });
    await expect(service.enforcePlan(WS_PAST_DUE, true)).rejects.toMatchObject({
      status: 402,
    });
  });

  it('past_due allows read requests through', async () => {
    const WS_PAST_DUE_READ = 'ws-past-due-read-uuid';
    subRepo.findOne.mockResolvedValue({ workspaceId: WS_PAST_DUE_READ, status: 'past_due' });
    await expect(service.enforcePlan(WS_PAST_DUE_READ, false)).resolves.toBeUndefined();
  });

  // ── enforcePlan: cancelled blocks writes with 403 ────────────────────────

  it('cancelled plan throws ForbiddenException on writes', async () => {
    const WS_CANCELLED = 'ws-cancelled-uuid';
    subRepo.findOne.mockResolvedValue({ workspaceId: WS_CANCELLED, status: 'cancelled' });
    await expect(service.enforcePlan(WS_CANCELLED, true)).rejects.toMatchObject({
      status: 403,
    });
  });
});
