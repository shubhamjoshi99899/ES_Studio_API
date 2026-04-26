import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/auth.service';

/**
 * Extracts the authenticated user's ID (users.id / JWT sub) from the request.
 *
 * Usage:
 *   async createNote(@CurrentUserId() actorId: string) { ... }
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request['user'] as (JwtPayload & { workspaceId?: string }) | undefined;

    if (!user?.sub) {
      throw new UnauthorizedException('No user in session.');
    }

    return user.sub;
  },
);
