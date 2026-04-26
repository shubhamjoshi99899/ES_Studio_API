import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  mixin,
  Type,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { WorkspacePlan } from '../modules/workspaces/entities/workspace.entity';
import { WorkspaceSubscription } from '../modules/billing/entities/workspace-subscription.entity';
import type { JwtPayload } from '../modules/auth/auth.service';

// ── Feature map ────────────────────────────────────────────────────────────

const PLAN_FEATURES: Record<WorkspacePlan, string[] | ['*']> = {
  starter:    ['schedule', 'campaigns', 'team'],
  pro:        ['schedule', 'campaigns', 'team', 'inbox', 'alerts', 'automation'],
  enterprise: ['*'],
};

const REDIS_TTL_SECONDS = 300; // 5 minutes
const SUB_CACHE_KEY = (workspaceId: string) => `sub:${workspaceId}`;

// ── Shared Redis client (lazy singleton) ───────────────────────────────────

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host:     process.env.REDIS_HOST     || 'localhost',
      port:     parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      tls:      process.env.REDIS_TLS === 'true' ? {} : undefined,
      lazyConnect: true,
    });
  }
  return redisClient;
}

// ── Helper: check feature access ──────────────────────────────────────────

export function planAllowsFeature(plan: WorkspacePlan, feature: string): boolean {
  const allowed = PLAN_FEATURES[plan];
  return allowed[0] === '*' || (allowed as string[]).includes(feature);
}

// ── Cached subscription shape ─────────────────────────────────────────────

type CachedSubscription = { plan: WorkspacePlan; status: string };

// ── Guard factory ─────────────────────────────────────────────────────────

/**
 * Returns a guard class that enforces feature access based on the workspace's
 * live subscription from workspace_subscriptions (source of truth). Subscription
 * data is cached in Redis under key sub:{workspaceId} for 5 minutes.
 *
 * Usage:
 *   @UseGuards(PlanGuard('automation'))
 *   @Get('automation/rules')
 *   async listRules(@WorkspaceId() workspaceId: string) { ... }
 */
export function PlanGuard(featureKey: string): Type<CanActivate> {
  @Injectable()
  class PlanGuardMixin implements CanActivate {
    constructor(
      @InjectRepository(WorkspaceSubscription)
      private readonly subRepo: Repository<WorkspaceSubscription>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<{
        user?: JwtPayload & { workspaceId?: string };
        method?: string;
      }>();
      const workspaceId = request.user?.workspaceId;

      if (!workspaceId) {
        throw new ForbiddenException('No workspace context in session.');
      }

      const { plan, status } = await this.getCachedSubscription(workspaceId);

      if (status === 'cancelled') {
        // Cancelled subscription → downgrade to starter for feature checks
        if (!planAllowsFeature('starter', featureKey)) {
          throw new ForbiddenException(
            `Your plan (starter) does not include access to '${featureKey}'. Upgrade to unlock this feature.`,
          );
        }
        return true;
      }

      if (status === 'past_due') {
        const method = (request.method ?? 'GET').toUpperCase();
        if (method !== 'GET') {
          throw new HttpException(
            { code: 'PAYMENT_REQUIRED', message: 'Update billing to continue' },
            402,
          );
        }
        // GET requests pass through; fall to plan feature check below
      }

      // status = 'active' | 'trialing' | 'past_due' (GET only)
      if (!planAllowsFeature(plan as WorkspacePlan, featureKey)) {
        throw new ForbiddenException(
          `Your plan (${plan}) does not include access to '${featureKey}'. Upgrade to unlock this feature.`,
        );
      }

      return true;
    }

    private async getCachedSubscription(workspaceId: string): Promise<CachedSubscription> {
      const redis = getRedis();
      const cacheKey = SUB_CACHE_KEY(workspaceId);

      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as CachedSubscription;
      } catch {
        // Redis unavailable — fall through to DB
      }

      const sub = await this.subRepo.findOne({
        where: { workspaceId },
        select: ['plan', 'status'],
      });

      const result: CachedSubscription = sub
        ? { plan: sub.plan, status: sub.status }
        : { plan: 'starter', status: 'active' };

      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', REDIS_TTL_SECONDS);
      } catch {
        // Cache write failure is non-fatal
      }

      return result;
    }
  }

  return mixin(PlanGuardMixin);
}
