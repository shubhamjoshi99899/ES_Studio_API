import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';

export interface JwtPayload {
  sub: string;          // user id
  email: string;
  workspaceId?: string; // active workspace — populated at login once workspaces exist
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
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

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async issueTokens(
    user: User,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; email: string }> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

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
      { sub: user.id, sid: session.id },
      {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        expiresIn: '30d',
      },
    );

    // Store bcrypt hash of the refresh token
    session.tokenHash = await bcrypt.hash(refreshToken, 10);
    await this.sessionRepo.save(session);

    return { accessToken, refreshToken, email: user.email };
  }
}
