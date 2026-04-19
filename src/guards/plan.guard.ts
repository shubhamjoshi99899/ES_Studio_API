import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
  Type,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Workspace, WorkspacePlan } from '../modules/workspaces/entities/workspace.entity';
import type { JwtPayload } from '../modules/auth/auth.service';

// ── Feature map ────────────────────────────────────────────────────────────

const PLAN_FEATURES: Record<WorkspacePlan, string[] | ['*']> = {
  starter:    ['schedule', 'campaigns', 'team'],
  pro:        ['schedule', 'campaigns', 'team', 'inbox', 'alerts', 'automation'],
  enterprise: ['*'],
};

const REDIS_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY = (workspaceId: string) => `plan:${workspaceId}`;

// ── Shared Redis client (lazy singleton) ───────────────────────────────────

let redisClient: Redis | null = null;

function getRedis(): Redis {
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

// ── Guard factory ─────────────────────────────────────────────────────────

/**
 * Returns a guard class that denies access when the workspace's plan does not
 * include `featureKey`. The workspace plan is cached in Redis for 5 minutes.
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
      @InjectRepository(Workspace)
      private readonly workspaceRepo: Repository<Workspace>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<{ user?: JwtPayload & { workspaceId?: string } }>();
      const workspaceId = request.user?.workspaceId;

      if (!workspaceId) {
        throw new ForbiddenException('No workspace context in session.');
      }

      const plan = await this.resolvePlan(workspaceId);

      if (!planAllowsFeature(plan, featureKey)) {
        throw new ForbiddenException(
          `Your plan (${plan}) does not include access to '${featureKey}'. Upgrade to unlock this feature.`,
        );
      }

      return true;
    }

    private async resolvePlan(workspaceId: string): Promise<WorkspacePlan> {
      const redis = getRedis();
      const cacheKey = CACHE_KEY(workspaceId);

      try {
        const cached = await redis.get(cacheKey);
        if (cached) return cached as WorkspacePlan;
      } catch {
        // Redis unavailable — fall through to DB
      }

      const workspace = await this.workspaceRepo.findOne({
        where: { id: workspaceId },
        select: ['id', 'plan'],
      });

      if (!workspace) {
        throw new ForbiddenException('Workspace not found.');
      }

      try {
        await redis.set(cacheKey, workspace.plan, 'EX', REDIS_TTL_SECONDS);
      } catch {
        // Cache write failure is non-fatal
      }

      return workspace.plan;
    }
  }

  return mixin(PlanGuardMixin);
}
