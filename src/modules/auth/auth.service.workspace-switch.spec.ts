import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRepo = () => ({
  find:         jest.fn(),
  findOne:      jest.fn(),
  findOneOrFail: jest.fn(),
  count:        jest.fn(),
  create:       jest.fn((v: any) => v),
  save:         jest.fn(async (v: any) => ({ id: 'session-uuid', ...v })),
  update:       jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    set:    jest.fn().mockReturnThis(),
    where:  jest.fn().mockReturnThis(),
    execute: jest.fn(),
  })),
});

const WS_A = 'workspace-a-uuid';
const WS_B = 'workspace-b-uuid';
const USER_ID = 'user-uuid-001';

const MOCK_USER: Partial<User> = {
  id:           USER_ID,
  email:        'alice@acme.com',
  passwordHash: '$2b$10$hashedpassword',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService — workspace switcher', () => {
  let service: AuthService;
  let userRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    userRepo    = mockRepo();
    sessionRepo = mockRepo();
    jwtService  = { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() };

    dataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User),    useValue: userRepo },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
        { provide: JwtService,   useValue: jwtService },
        { provide: DataSource,   useValue: dataSource },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── User in two workspaces: switch succeeds ────────────────────────────

  it('switch succeeds and new JWT carries targetWorkspaceId', async () => {
    // resolveWorkspaceId (called from issueTokensForWorkspace) returns WS_A
    dataSource.query
      .mockResolvedValueOnce([{ workspace_id: WS_B, name: 'Workspace B', plan: 'pro' }]) // membership check
      .mockResolvedValueOnce([{ workspace_id: WS_A }]); // resolveWorkspaceId inside issueTokens

    userRepo.findOneOrFail.mockResolvedValue(MOCK_USER as User);
    sessionRepo.save.mockResolvedValue({ id: 'sess-uuid', tokenHash: 'pending' });

    const result = await service.switchWorkspace(USER_ID, WS_B, '127.0.0.1', 'test-agent');

    expect(result.workspaceId).toBe(WS_B);
    expect(result.workspaceName).toBe('Workspace B');
    expect(result.plan).toBe('pro');
    expect(result.accessToken).toBe('signed.jwt.token');

    // JWT sign should be called with workspaceId = WS_B in the payload
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_B }),
      expect.anything(),
    );
  });

  // ── User not in target workspace → 403 ───────────────────────────────────

  it('throws ForbiddenException when user is not an active member of target workspace', async () => {
    dataSource.query.mockResolvedValueOnce([]); // no membership row

    await expect(
      service.switchWorkspace(USER_ID, WS_B, '127.0.0.1', 'test-agent'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── getMe returns all active workspaces ──────────────────────────────────

  it('getMe returns currentWorkspaceId and all active workspaces', async () => {
    userRepo.findOneOrFail.mockResolvedValue(MOCK_USER as User);

    const workspacesRow = [
      { id: WS_A, name: 'Workspace A', plan: 'starter', role: 'admin' },
      { id: WS_B, name: 'Workspace B', plan: 'pro',     role: 'analyst' },
    ];

    dataSource.query
      .mockResolvedValueOnce(workspacesRow)           // getMe workspaces query
      .mockResolvedValueOnce([{ workspace_id: WS_A }]); // resolveWorkspaceId

    const me = await service.getMe(USER_ID);

    expect(me.userId).toBe(USER_ID);
    expect(me.email).toBe('alice@acme.com');
    expect(me.currentWorkspaceId).toBe(WS_A);
    expect(me.workspaces).toHaveLength(2);
    expect(me.workspaces[1].id).toBe(WS_B);
  });

  // ── Switch → ops route: JWT workspaceId matches target ──────────────────

  it('after switch the issued JWT embeds the target workspaceId, not the original', async () => {
    // User originally in WS_A, switches to WS_B
    dataSource.query
      .mockResolvedValueOnce([{ workspace_id: WS_B, name: 'Workspace B', plan: 'pro' }]) // membership check
      .mockResolvedValueOnce([]); // resolveWorkspaceId (not called in issueTokensForWorkspace, we pass it directly)

    userRepo.findOneOrFail.mockResolvedValue(MOCK_USER as User);
    sessionRepo.save.mockResolvedValue({ id: 'sess-uuid', tokenHash: 'pending' });

    await service.switchWorkspace(USER_ID, WS_B, '127.0.0.1', 'ua');

    const signCalls = (jwtService.sign.mock.calls as any[][]);
    // First sign call is the access token — payload must have workspaceId = WS_B
    const [accessPayload] = signCalls[0];
    expect(accessPayload.workspaceId).toBe(WS_B);
    expect(accessPayload.workspaceId).not.toBe(WS_A);
  });
});
