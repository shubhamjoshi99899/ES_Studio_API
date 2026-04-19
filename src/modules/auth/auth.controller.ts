import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { SetupGuard } from '../../common/guards/setup.guard';
import { LoginDto } from './dto/login.dto';
import { SetupAdminDto } from './dto/setup-admin.dto';

const ACCESS_TOKEN_TTL  = 15 * 60 * 1000;           // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const COOKIE_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const { accessToken, refreshToken, email } = await this.authService.login(
      dto.email,
      dto.password,
      ip,
      userAgent,
    );

    res.cookie('access_token', accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_TTL,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_BASE,
      maxAge: REFRESH_TOKEN_TTL,
      path: '/api/auth/refresh', // scope refresh cookie to its endpoint only
    });

    return { message: 'Login successful', email };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.['refresh_token'] as string | undefined;
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const { accessToken, refreshToken, email } = await this.authService.refresh(
      rawRefreshToken,
      ip,
      userAgent,
    );

    res.cookie('access_token', accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_TTL,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_BASE,
      maxAge: REFRESH_TOKEN_TTL,
      path: '/api/auth/refresh',
    });

    return { message: 'Token refreshed', email };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Best-effort: revoke server-side sessions if a valid access token is present
    const token = req.cookies?.['access_token'] as string | undefined;
    if (token) {
      try {
        const payload = req['user'] as { sub?: string } | undefined;
        if (payload?.sub) {
          await this.authService.logout(payload.sub);
        }
      } catch {
        // Ignore — clear cookies regardless
      }
    }

    res.clearCookie('access_token', { ...COOKIE_BASE });
    res.clearCookie('refresh_token', { ...COOKIE_BASE, path: '/api/auth/refresh' });
    return { message: 'Logged out successfully' };
  }

  @Public()
  @UseGuards(SetupGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('setup')
  async setupAdmin(
    @Body() dto: SetupAdminDto,
    @Headers('x-setup-secret') setupSecret: string,
  ) {
    const validSetupSecret = process.env.SETUP_SECRET;

    if (!validSetupSecret) {
      throw new UnauthorizedException(
        'Setup secret is not configured on the server.',
      );
    }
    if (setupSecret !== validSetupSecret) {
      throw new UnauthorizedException('Invalid setup secret.');
    }

    return this.authService.createAdminUser(dto.email, dto.password);
  }
}
