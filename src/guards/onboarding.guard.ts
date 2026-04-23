import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as { workspaceId?: string | null } | undefined;

    if (!user?.workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_REQUIRED',
        redirectTo: '/onboarding',
      });
    }

    return true;
  }
}
