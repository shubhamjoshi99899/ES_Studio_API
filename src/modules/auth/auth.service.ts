import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';

export interface JwtPayload {
  sub: string;          // user id
  email: string;
  workspaceId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
    private dataSource: DataSource,
    private jwtService: JwtService,
  ) {}

  // ── Login ────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; email: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user, ip, userAgent);
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(
    rawRefreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; email: string }> {
    // Decode without verification first to get the session id embedded in the token
    let payload: { sub: string; sid: string } | null = null;
    try {
      payload = this.jwtService.verify<{ sub: string; sid: string }>(
        rawRefreshToken,
        { secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionRepo.findOne({
      where: { id: payload.sid },
      relations: ['user'],
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const tokenMatch = await bcrypt.compare(rawRefreshToken, session.tokenHash);
    if (!tokenMatch) throw new UnauthorizedException('Invalid refresh token');

    // Rotate: revoke old session, issue fresh pair
    await this.sessionRepo.update(session.id, { revokedAt: new Date() });
    return this.issueTokens(session.user, ip, userAgent);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    // Revoke all active sessions for this user (single-device logout revokes all)
    await this.sessionRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('"user_id" = :userId AND "revoked_at" IS NULL', { userId })
      .execute();
  }

  // ── Admin setup ───────────────────────────────────────────────────────────

  async createAdminUser(email: string, plainTextPassword: string) {
    if (!email || !plainTextPassword) {
      throw new BadRequestException('Email and password are required');
    }
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(plainTextPassword, 12);
    const newUser = this.userRepo.create({ email, passwordHash });
    await this.userRepo.save(newUser);
    return { message: 'Admin account created successfully.', email: newUser.email };
  }

  async hasAnyUser(): Promise<boolean> {
    return (await this.userRepo.count()) > 0;
  }

  // ── Switch workspace ──────────────────────────────────────────────────────

  async switchWorkspace(
    userId: string,
    targetWorkspaceId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; workspaceId: string; workspaceName: string; plan: string }> {
    // 1. Verify user is an active member of the target workspace
    const [membership] = await this.dataSource.query<
      Array<{ workspace_id: string; name: string; plan: string }>
    >(
      `SELECT wu.workspace_id, w.name, w.plan
       FROM workspace_users wu
       JOIN workspaces w ON w.id = wu.workspace_id
       WHERE wu.user_id = $1
         AND wu.workspace_id = $2
         AND wu.status = 'active'
       LIMIT 1`,
      [userId, targetWorkspaceId],
    );

    if (!membership) {
      throw new ForbiddenException('You are not an active member of this workspace');
    }

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    // 2. Issue new tokens scoped to the target workspace
    const { accessToken, refreshToken } = await this.issueTokensForWorkspace(
      user,
      targetWorkspaceId,
      ip,
      userAgent,
    );

    return {
      accessToken,
      refreshToken,
      workspaceId: membership.workspace_id,
      workspaceName: membership.name,
      plan: membership.plan,
    };
  }

  // ── Get current user with all workspaces ──────────────────────────────────

  async getMe(userId: string): Promise<{
    userId: string;
    email: string;
    currentWorkspaceId: string | null;
    workspaces: Array<{ id: string; name: string; plan: string; role: string }>;
  }> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const workspaces = await this.dataSource.query<
      Array<{ id: string; name: string; plan: string; role: string }>
    >(
      `SELECT w.id, w.name, w.plan, wu.role
       FROM workspace_users wu
       JOIN workspaces w ON w.id = wu.workspace_id
       WHERE wu.user_id = $1 AND wu.status = 'active'
       ORDER BY wu.accepted_at ASC`,
      [userId],
    );

    const currentWorkspaceId = await this.resolveWorkspaceId(userId);

    return {
      userId: user.id,
      email: user.email,
      currentWorkspaceId,
      workspaces,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async issueTokens(
    user: User,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; email: string }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    const { accessToken, refreshToken } = await this.issueTokensForWorkspace(
      user,
      workspaceId,
      ip,
      userAgent,
    );
    return { accessToken, refreshToken, email: user.email };
  }

  private async issueTokensForWorkspace(
    user: User,
    workspaceId: string | null,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspaceId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    // Create a session row first to get the session id (used as `sid` in refresh token)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = this.sessionRepo.create({
      userId: user.id,
      tokenHash: 'pending', // replaced below after we know the token
      expiresAt,
      userAgent: userAgent || 'unknown',
      ip: ip || 'unknown',
    });
    await this.sessionRepo.save(session);

    // Embed the session id in the refresh token so we can look it up on refresh
    const refreshToken = this.jwtService.sign(
      { ...payload, sid: session.id },
      {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        expiresIn: '30d',
      },
    );

    // Store bcrypt hash of the refresh token
    session.tokenHash = await bcrypt.hash(refreshToken, 10);
    await this.sessionRepo.save(session);

    return { accessToken, refreshToken };
  }

  private async resolveWorkspaceId(userId: string): Promise<string | null> {
    const [membership] = await this.dataSource.query<
      Array<{ workspace_id: string }>
    >(
      `
      SELECT workspace_id
      FROM workspace_users
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY accepted_at ASC
      LIMIT 1
      `,
      [userId],
    );

    return membership?.workspace_id ?? null;
  }
}
