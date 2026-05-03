import {
  Controller,
  Post,
  Get,
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
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Public } from '../../common/decorators/public.decorator';
import { SetupGuard } from '../../common/guards/setup.guard';
import { LoginDto } from './dto/login.dto';
import { SetupAdminDto } from './dto/setup-admin.dto';
import { RegisterDto } from './dto/register.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleOAuthConfigGuard } from './google-oauth-config.guard';

const ACCESS_TOKEN_TTL  = 15 * 60 * 1000;           // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const COOKIE_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
};

@Controller('api/auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspacesService: WorkspacesService,
  ) {}

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

  // ── POST /api/auth/workspace/create ──────────────────────────────────────

  @Post('workspace/create')
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(
    @Body() dto: CreateWorkspaceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req['user'] as { sub: string; email: string } | undefined;
    if (!user?.sub) throw new UnauthorizedException('Not authenticated');

    const { workspace, accessToken } =
      await this.workspacesService.createWorkspaceWithOwner(user.sub, user.email, dto);

    res.cookie('access_token', accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_TTL,
    });

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      plan: workspace.plan,
    };
  }

  // ── POST /api/auth/register ───────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendVerification(dto.email);
  }

  // ── GET /api/auth/verify-email ────────────────────────────────────────────

  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const token = (req.query as Record<string, string>)['token'];
    if (!token) {
      const frontendUrl = process.env.FRONTEND_URL ?? '';
      return res.redirect(302, `${frontendUrl}/login?error=invalid_token`);
    }

    try {
      const { accessToken } = await this.authService.verifyEmail(token);
      res.cookie('access_token', accessToken, { ...COOKIE_BASE, maxAge: ACCESS_TOKEN_TTL });
      const frontendUrl = process.env.FRONTEND_URL ?? '';
      res.redirect(302, `${frontendUrl}/onboarding`);
    } catch {
      const frontendUrl = process.env.FRONTEND_URL ?? '';
      res.redirect(302, `${frontendUrl}/login?error=invalid_token`);
    }
  }

  // ── GET /api/auth/google ──────────────────────────────────────────────────

  @Public()
  @UseGuards(GoogleOAuthConfigGuard, AuthGuard('google'))
  @Get('google')
  googleLogin() {
    // Passport intercepts and redirects to Google consent screen
  }

  @Public()
  @UseGuards(GoogleOAuthConfigGuard, AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const googleUser = req['user'] as {
        email: string;
        name: string;
        googleId: string;
        avatar: string | null;
      };
      const result = await this.authService.handleGoogleAuth(googleUser);

      res.cookie('access_token', result.accessToken, {
        ...COOKIE_BASE,
        maxAge: ACCESS_TOKEN_TTL,
      });

      const frontendUrl = process.env.FRONTEND_URL ?? '';
      res.redirect(302, result.isNew ? `${frontendUrl}/onboarding` : `${frontendUrl}/dashboard`);
    } catch {
      const frontendUrl = process.env.FRONTEND_URL ?? '';
      res.redirect(302, `${frontendUrl}/login?error=oauth_failed`);
    }
  }

  // ── GET /api/auth/me ──────────────────────────────────────────────────────

  @Get('me')
  async me(@Req() req: Request) {
    const user = req['user'] as { sub: string } | undefined;
    if (!user?.sub) throw new UnauthorizedException('Not authenticated');
    return this.authService.getMe(user.sub);
  }

  // ── POST /api/auth/switch-workspace ───────────────────────────────────────

  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  async switchWorkspace(
    @Body() body: { workspaceId: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req['user'] as { sub: string } | undefined;
    if (!user?.sub) throw new UnauthorizedException('Not authenticated');

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const result = await this.authService.switchWorkspace(
      user.sub,
      body.workspaceId,
      ip,
      userAgent,
    );

    res.cookie('access_token', result.accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_TTL,
    });
    res.cookie('refresh_token', result.refreshToken, {
      ...COOKIE_BASE,
      maxAge: REFRESH_TOKEN_TTL,
      path: '/api/auth/refresh',
    });

    return {
      workspaceId: result.workspaceId,
      workspaceName: result.workspaceName,
      plan: result.plan,
    };
  }
}
