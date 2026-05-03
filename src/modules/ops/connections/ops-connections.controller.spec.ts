import { Test, TestingModule } from '@nestjs/testing';

import { OpsConnectionsController } from './ops-connections.controller';
import { OpsConnectionsService } from './ops-connections.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

const makeMockRes = () => ({ redirect: jest.fn() });

describe('OpsConnectionsController — handleOAuthCallback', () => {
  let controller: OpsConnectionsController;
  let mockService: { handleCallback: jest.Mock };

  beforeEach(async () => {
    mockService = { handleCallback: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpsConnectionsController],
      providers: [
        { provide: OpsConnectionsService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(OpsConnectionsController);
  });

  it('redirects to /settings/connections?error= and does not propagate when the service throws', async () => {
    mockService.handleCallback.mockRejectedValue(new Error('unexpected failure'));
    const res = makeMockRes();

    await expect(
      controller.handleOAuthCallback('code', 'state', res as any),
    ).resolves.toBeUndefined();

    expect(res.redirect).toHaveBeenCalledTimes(1);
    const [, url] = res.redirect.mock.calls[0] as [number, string];
    expect(url).toContain('/settings/connections');
    expect(url).toContain('error=');
  });

  it('redirects with error=unknown for a generic Error', async () => {
    mockService.handleCallback.mockRejectedValue(new Error('boom'));
    const res = makeMockRes();

    await controller.handleOAuthCallback('code', 'state', res as any);

    const [, url] = res.redirect.mock.calls[0] as [number, string];
    expect(url).toContain('error=unknown');
  });

  it('redirects to /settings/connections?connected=facebook&count=2 on success', async () => {
    mockService.handleCallback.mockResolvedValue({
      workspaceId: 'ws-123',
      platform:    'facebook',
      connected:   2,
    });
    const res = makeMockRes();

    await controller.handleOAuthCallback('auth-code', 'jwt-state', res as any);

    expect(res.redirect).toHaveBeenCalledTimes(1);
    const [status, url] = res.redirect.mock.calls[0] as [number, string];
    expect(status).toBe(302);
    expect(url).toContain('/settings/connections');
    expect(url).toContain('connected=facebook');
    expect(url).toContain('count=2');
  });
});
