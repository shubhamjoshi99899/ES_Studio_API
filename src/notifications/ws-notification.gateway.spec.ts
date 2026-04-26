import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WsNotificationGateway } from './ws-notification.gateway';
import { NotificationEvent } from './notification.gateway';
import { Socket } from 'socket.io';

const makeClient = (overrides: Partial<Socket> = {}): jest.Mocked<Socket> =>
  ({
    id: 'test-client',
    handshake: { auth: {}, headers: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  }) as unknown as jest.Mocked<Socket>;

describe('WsNotificationGateway', () => {
  let gateway: WsNotificationGateway;
  let jwtService: jest.Mocked<JwtService>;
  let mockServer: { to: jest.Mock };

  beforeEach(async () => {
    mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsNotificationGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get(WsNotificationGateway);
    jwtService = module.get(JwtService);

    // Inject mock server (normally set by @WebSocketServer decorator at runtime)
    (gateway as any).server = mockServer;
  });

  const event: NotificationEvent = {
    type: 'test',
    title: 'Hello',
    body: 'World',
    createdAt: new Date(),
  };

  describe('sendToWorkspace', () => {
    it('emits to the correct workspace room', async () => {
      const emitMock = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitMock });

      await gateway.sendToWorkspace('ws-1', event);

      expect(mockServer.to).toHaveBeenCalledWith('workspace:ws-1');
      expect(emitMock).toHaveBeenCalledWith('notification', event);
    });
  });

  describe('sendToUser', () => {
    it('emits to the correct user room', async () => {
      const emitMock = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitMock });

      await gateway.sendToUser('user-42', event);

      expect(mockServer.to).toHaveBeenCalledWith('user:user-42');
      expect(emitMock).toHaveBeenCalledWith('notification', event);
    });
  });

  describe('handleConnection', () => {
    it('disconnects client when JWT is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const client = makeClient({ handshake: { auth: { token: 'bad-token' }, headers: {} } } as any);
      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when no token is present', () => {
      const client = makeClient();
      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('joins workspace and user rooms on valid JWT', () => {
      jwtService.verify.mockReturnValue({ sub: 'u1', workspaceId: 'w1' });

      const client = makeClient({ handshake: { auth: { token: 'valid-token' }, headers: {} } } as any);
      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('workspace:w1');
      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });
});
