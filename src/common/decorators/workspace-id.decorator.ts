import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/auth.service';

/**
 * Extracts `workspaceId` from the authenticated JWT payload attached to the
 * request by JwtAuthGuard.
 *
 * Usage:
 *   async getMetrics(@WorkspaceId() workspaceId: string) { ... }
 *
 * IMPORTANT: workspaceId is NEVER read from req.body. It comes exclusively
 * from the verified JWT so it cannot be spoofed by the caller.
 */
export const WorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request['user'] as (JwtPayload & { workspaceId?: string }) | undefined;

    if (!user?.workspaceId) {
      throw new UnauthorizedException(
        'No workspace associated with this session.',
      );
    }

    return user.workspaceId;
  },
);
