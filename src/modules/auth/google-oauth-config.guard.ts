import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class GoogleOAuthConfigGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new InternalServerErrorException(
        'Google OAuth is not configured on the server.',
      );
    }

    return true;
  }
}
