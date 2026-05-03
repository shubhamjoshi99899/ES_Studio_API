import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, GoneException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { MailService } from '../../common/mail/mail.service';

jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('hashed-value'),
  compare: jest.fn().mockResolvedValue(false),
}));

const USER_ID    = 'user-recovery-uuid';
const USER_EMAIL = 'alice@example.com';

const makeUserRepo = () => ({
  findOne:       jest.fn(),
  findOneOrFail: jest.fn(),
  count:         jest.fn(),
  create:        jest.fn((v: any) => v),
  save:          jest.fn(async (v: any) => ({ id: USER_ID, ...v })),
  update:        jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where:   jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});

const makeSessionRepo = () => ({
  findOne: jest.fn(),
  create:  jest.fn((v: any) => v),
  save:    jest.fn(async (v: any) => v),
  update:  jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    update:  jest.fn().mockReturnThis(),
    set:     jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    execute: jest.fn(),
  })),
});

const buildModule = async (
  userRepoValue: any,
  sessionRepoValue: any,
  mailValue: any,
): Promise<AuthService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: getRepositoryToken(User),    useValue: userRepoValue },
      { provide: getRepositoryToken(Session), useValue: sessionRepoValue },
      { provide: JwtService,  useValue: { sign: jest.fn().mockReturnValue('tok'), verify: jest.fn() } },
      { provide: DataSource,  useValue: { query: jest.fn().mockResolvedValue([]) } },
      { provide: MailService, useValue: mailValue },
    ],
  }).compile();
  return module.get(AuthService);
};

// ── forgotPassword ─────────────────────────────────────────────────────────────

describe('AuthService — forgotPassword', () => {
  let userRepo: ReturnType<typeof makeUserRepo>;
  let mail: { sendPasswordReset: jest.Mock; sendVerification: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    userRepo = makeUserRepo();
    mail = { sendPasswordReset: jest.fn(), sendVerification: jest.fn() };
    service = await buildModule(userRepo, makeSessionRepo(), mail);
  });

  afterEach(() => jest.clearAllMocks());

  it('resolves without error and sends no email when user is not found (no enumeration)', async () => {
    userRepo.findOne.mockResolvedValue(null);

    const result = await service.forgotPassword('nobody@example.com');

    expect(result.message).toBeTruthy();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('stores a hashed reset token with ~1 hr expiry and calls sendPasswordReset when user is found', async () => {
    const before = Date.now();
    userRepo.findOne.mockResolvedValue({ id: USER_ID, email: USER_EMAIL });

    await service.forgotPassword(USER_EMAIL);

    const [calledId, fields] = userRepo.update.mock.calls[0];
    expect(calledId).toBe(USER_ID);
    expect(fields.resetToken).toBeTruthy();

    const diffMs = (fields.resetTokenExpiresAt as Date).getTime() - before;
    expect(diffMs).toBeGreaterThan(60 * 60 * 1000 - 5_000);
    expect(diffMs).toBeLessThan(60 * 60 * 1000 + 5_000);

    expect(mail.sendPasswordReset).toHaveBeenCalledWith(USER_EMAIL, expect.any(String));
  });

  it('normalises email to lowercase before the lookup', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await service.forgotPassword('USER@EXAMPLE.COM');

    expect(userRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
  });
});

// ── resetPassword ──────────────────────────────────────────────────────────────

describe('AuthService — resetPassword', () => {
  let userRepo: ReturnType<typeof makeUserRepo>;
  let sessionRepo: ReturnType<typeof makeSessionRepo>;
  let service: AuthService;

  beforeEach(async () => {
    userRepo    = makeUserRepo();
    sessionRepo = makeSessionRepo();
    service = await buildModule(
      userRepo,
      sessionRepo,
      { sendPasswordReset: jest.fn(), sendVerification: jest.fn() },
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('updates password and clears token when token is valid and not expired', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const storedUser = {
      id: USER_ID, email: USER_EMAIL,
      resetToken: 'hashed-token', resetTokenExpiresAt: futureExpiry,
    };
    userRepo.createQueryBuilder.mockReturnValue({
      where:   jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([storedUser]),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const result = await service.resetPassword('raw-valid-token', 'NewPassword1!');

    expect(result.message).toBeTruthy();
    expect(userRepo.update).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ resetToken: null, resetTokenExpiresAt: null }),
    );
  });

  it('throws GoneException when the matched token is expired', async () => {
    const pastExpiry = new Date(Date.now() - 1_000);
    const storedUser = {
      id: USER_ID, email: USER_EMAIL,
      resetToken: 'hashed-token', resetTokenExpiresAt: pastExpiry,
    };
    userRepo.createQueryBuilder.mockReturnValue({
      where:   jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([storedUser]),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    await expect(service.resetPassword('expired-token', 'NewPassword1!'))
      .rejects.toBeInstanceOf(GoneException);
  });

  it('throws BadRequestException when no user has a matching token', async () => {
    userRepo.createQueryBuilder.mockReturnValue({
      where:   jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    // bcrypt.compare stays false (default mock)

    await expect(service.resetPassword('unknown-token', 'NewPassword1!'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── resendVerification ─────────────────────────────────────────────────────────

describe('AuthService — resendVerification', () => {
  let userRepo: ReturnType<typeof makeUserRepo>;
  let mail: { sendVerification: jest.Mock; sendPasswordReset: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    userRepo = makeUserRepo();
    mail = { sendVerification: jest.fn(), sendPasswordReset: jest.fn() };
    service = await buildModule(userRepo, makeSessionRepo(), mail);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns a message and sends no email when user is already verified', async () => {
    userRepo.findOne.mockResolvedValue({ id: USER_ID, email: USER_EMAIL, emailVerified: true });

    const result = await service.resendVerification(USER_EMAIL);

    expect(result.message).toBeTruthy();
    expect(mail.sendVerification).not.toHaveBeenCalled();
  });

  it('sends a verification email when user is not yet verified', async () => {
    userRepo.findOne.mockResolvedValue({ id: USER_ID, email: USER_EMAIL, emailVerified: false });

    await service.resendVerification(USER_EMAIL);

    expect(mail.sendVerification).toHaveBeenCalledWith(USER_EMAIL, expect.any(String));
  });

  it('normalises email to lowercase before the lookup', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await service.resendVerification('USER@EXAMPLE.COM');

    expect(userRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
  });
});
