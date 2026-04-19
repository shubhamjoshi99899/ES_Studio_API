import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { PlanGuard, planAllowsFeature } from './plan.guard';
import { Workspace } from '../modules/workspaces/entities/workspace.entity';

// Silence ioredis connection attempts during unit tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),        // always cache miss
    set: jest.fn().mockResolvedValue('OK'),
  }));
});

// ── Helper: build a minimal ExecutionContext with a workspaceId ────────────

function makeContext(workspaceId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'user-1', email: 'a@b.com', workspaceId } }),
    }),
  } as unknown as ExecutionContext;
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

// ── PlanGuard integration (mocked repo + Redis) ───────────────────────────

describe('PlanGuard — starter workspace denied automation', () => {
  it('throws ForbiddenException when starter plan requests automation feature', async () => {
    const mockWorkspace: Pick<Workspace, 'id' | 'plan'> = {
      id: 'ws-starter-1',
      plan: 'starter',
    };

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(mockWorkspace),
    };

    const GuardClass = PlanGuard('automation');

    const module = await Test.createTestingModule({
      providers: [
        GuardClass,
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockRepo,
        },
      ],
    }).compile();

    const guard = module.get<InstanceType<typeof GuardClass>>(GuardClass);
    const ctx   = makeContext('ws-starter-1');

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      "Your plan (starter) does not include access to 'automation'",
    );
  });

  it('allows a pro workspace to access automation', async () => {
    const mockWorkspace: Pick<Workspace, 'id' | 'plan'> = {
      id: 'ws-pro-1',
      plan: 'pro',
    };

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(mockWorkspace),
    };

    const GuardClass = PlanGuard('automation');

    const module = await Test.createTestingModule({
      providers: [
        GuardClass,
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockRepo,
        },
      ],
    }).compile();

    const guard = module.get<InstanceType<typeof GuardClass>>(GuardClass);
    const ctx   = makeContext('ws-pro-1');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
