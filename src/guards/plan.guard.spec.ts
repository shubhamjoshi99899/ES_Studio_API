import { ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { PlanGuard, planAllowsFeature } from './plan.guard';
import { WorkspaceSubscription } from '../modules/billing/entities/workspace-subscription.entity';

// Silence ioredis connection attempts during unit tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),        // always cache miss
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  }));
});

// ── Helper: build a minimal ExecutionContext ───────────────────────────────

function makeContext(workspaceId: string, method = 'GET'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { sub: 'user-1', email: 'a@b.com', workspaceId },
        method,
      }),
    }),
  } as unknown as ExecutionContext;
}

// ── Helper: build a test module with a mocked subRepo ─────────────────────

async function buildGuard(
  featureKey: string,
  subRow: { plan: string; status: string } | null,
) {
  const mockSubRepo = {
    findOne: jest.fn().mockResolvedValue(subRow),
  };

  const GuardClass = PlanGuard(featureKey);

  const module = await Test.createTestingModule({
    providers: [
      GuardClass,
      {
        provide: getRepositoryToken(WorkspaceSubscription),
        useValue: mockSubRepo,
      },
    ],
  }).compile();

  return module.get<InstanceType<typeof GuardClass>>(GuardClass);
}

// ── planAllowsFeature unit tests ──────────────────────────────────────────

describe('planAllowsFeature()', () => {
  it('starter allows schedule', () => {
    expect(planAllowsFeature('starter', 'schedule')).toBe(true);
  });

  it('starter denies automation', () => {
    expect(planAllowsFeature('starter', 'automation')).toBe(false);
  });

  it('pro allows automation', () => {
    expect(planAllowsFeature('pro', 'automation')).toBe(true);
  });

  it('enterprise allows everything via wildcard', () => {
    expect(planAllowsFeature('enterprise', 'any_future_feature')).toBe(true);
  });
});

// ── PlanGuard — plan feature checks ──────────────────────────────────────

describe('PlanGuard — starter workspace denied automation', () => {
  it('throws ForbiddenException when starter plan requests automation feature', async () => {
    const guard = await buildGuard('automation', { plan: 'starter', status: 'active' });
    const ctx   = makeContext('ws-starter-1');

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      "Your plan (starter) does not include access to 'automation'",
    );
  });

  it('allows a pro workspace to access automation', async () => {
    const guard = await buildGuard('automation', { plan: 'pro', status: 'active' });
    const ctx   = makeContext('ws-pro-1');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

// ── PlanGuard — subscription status enforcement ───────────────────────────

describe('PlanGuard — subscription status enforcement', () => {
  it('past_due + GET request → allowed (read-only access preserved)', async () => {
    const guard = await buildGuard('inbox', { plan: 'pro', status: 'past_due' });
    const ctx   = makeContext('ws-past-due-1', 'GET');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('past_due + POST request → 402 PAYMENT_REQUIRED', async () => {
    const guard = await buildGuard('inbox', { plan: 'pro', status: 'past_due' });
    const ctx   = makeContext('ws-past-due-1', 'POST');

    let thrown: unknown;
    try {
      await guard.canActivate(ctx);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(402);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      code: 'PAYMENT_REQUIRED',
      message: 'Update billing to continue',
    });
  });

  it('cancelled subscription → treated as starter regardless of stored plan', async () => {
    // plan is 'pro' in DB but status is 'cancelled' → effective plan = starter
    const guard = await buildGuard('automation', { plan: 'pro', status: 'cancelled' });
    const ctx   = makeContext('ws-cancelled-1');

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      "Your plan (starter) does not include access to 'automation'",
    );
  });
});
