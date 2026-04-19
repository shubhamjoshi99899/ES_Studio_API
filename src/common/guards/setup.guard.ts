import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * Blocks POST /api/auth/setup once any admin user already exists in the DB.
 * Prevents the setup endpoint from being reused after initial provisioning.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const exists = await this.authService.hasAnyUser();
    if (exists) {
      throw new ForbiddenException(
        'Setup has already been completed. This endpoint is disabled.',
      );
    }
    return true;
  }
}
