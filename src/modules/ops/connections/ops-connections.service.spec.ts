import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { OpsConnectionsService } from './ops-connections.service';

const WORKSPACE_ID = 'ws-conn-test-001';
const CONN_ID      = 'conn-uuid-001';

// ── getOAuthUrl ────────────────────────────────────────────────────────────────

describe('OpsConnectionsService — getOAuthUrl', () => {
  let service: OpsConnectionsService;
  let savedEnv: Record<string, string | undefined> = {};

  const stashAndClear = (keys: string[]) => {
    for (const k of keys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  };

  const stashAndSet = (vars: Record<string, string>) => {
    for (const [k, v] of Object.entries(vars)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }
  };

  beforeEach(async () => {
    savedEnv = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsConnectionsService,
        { provide: DataSource,  useValue: { query: jest.fn().mockResolvedValue([]) } },
        { provide: JwtService,  useValue: { sign: jest.fn().mockReturnValue('signed-state'), verify: jest.fn() } },
      ],
    }).compile();
    service = module.get(OpsConnectionsService);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    savedEnv = {};
  });

  it('throws BadRequestException with a message naming META_APP_ID when it is missing', () => {
    stashAndClear(['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI']);

    let thrown: unknown;
    try {
      service.getOAuthUrl(WORKSPACE_ID, 'facebook');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse();
    expect(String(typeof response === 'string' ? response : (response as any).message))
      .toContain('META_APP_ID');
  });

  it('throws BadRequestException with a message naming LINKEDIN_CLIENT_ID when it is missing', () => {
    stashAndClear(['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI']);

    let thrown: unknown;
    try {
      service.getOAuthUrl(WORKSPACE_ID, 'linkedin');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse();
    expect(String(typeof response === 'string' ? response : (response as any).message))
      .toContain('LINKEDIN_CLIENT_ID');
  });

  it('returns a valid URL string containing redirect_uri when all required vars are present', () => {
    stashAndSet({
      META_APP_ID:      'test-app-id',
      META_APP_SECRET:  'test-secret',
      META_REDIRECT_URI: 'https://example.com/callback',
      JWT_SECRET:       'test-jwt-secret',
    });

    const result = service.getOAuthUrl(WORKSPACE_ID, 'facebook');

    expect(typeof result.authUrl).toBe('string');
    expect(result.authUrl).toContain('redirect_uri=');
  });
});

// ── disconnect ─────────────────────────────────────────────────────────────────

describe('OpsConnectionsService — disconnect', () => {
  let service: OpsConnectionsService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsConnectionsService,
        { provide: DataSource,  useValue: dataSource },
        { provide: JwtService,  useValue: { sign: jest.fn(), verify: jest.fn() } },
      ],
    }).compile();
    service = module.get(OpsConnectionsService);
  });

  it('resolves without error when the connection exists and belongs to the workspace', async () => {
    dataSource.query.mockResolvedValue([{ id: CONN_ID }]);

    await expect(service.disconnect(WORKSPACE_ID, CONN_ID)).resolves.toBeUndefined();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM platform_connections'),
      [CONN_ID, WORKSPACE_ID],
    );
  });

  it('throws NotFoundException when the connection does not exist', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.disconnect(WORKSPACE_ID, 'nonexistent-id'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the connection belongs to a different workspace (no cross-workspace leak)', async () => {
    // The DELETE uses WHERE id = $1 AND workspace_id = $2, so a mismatched
    // workspace yields an empty RETURNING result and triggers NotFoundException.
    dataSource.query.mockResolvedValue([]);

    await expect(service.disconnect('other-workspace-id', CONN_ID))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
