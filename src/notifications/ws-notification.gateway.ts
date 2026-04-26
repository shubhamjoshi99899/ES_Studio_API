import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { INotificationGateway, NotificationEvent } from './notification.gateway';

@Injectable()
@WebSocketGateway({
  cors: { origin: process.env.APP_URL, credentials: true },
  namespace: '/ws/notifications',
})
export class WsNotificationGateway
  implements INotificationGateway, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private readonly server: Server;
  private readonly logger = new Logger(WsNotificationGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.extractCookieToken(client);

    if (!token) {
      this.logger.warn(`WS no token — disconnecting ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; workspaceId: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
      const { sub: userId, workspaceId } = payload;
      client.join(this.workspaceRoom(workspaceId));
      client.join(this.userRoom(userId));
      this.logger.debug(
        `WS connect  client=${client.id} user=${userId} workspace=${workspaceId}`,
      );
    } catch {
      this.logger.warn(`WS invalid token — disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS disconnect client=${client.id}`);
  }

  async sendToWorkspace(workspaceId: string, event: NotificationEvent): Promise<void> {
    this.server.to(this.workspaceRoom(workspaceId)).emit('notification', event);
  }

  async sendToUser(userId: string, event: NotificationEvent): Promise<void> {
    this.server.to(this.userRoom(userId)).emit('notification', event);
  }

  private workspaceRoom = (id: string) => `workspace:${id}`;
  private userRoom = (id: string) => `user:${id}`;

  private extractCookieToken(client: Socket): string | undefined {
    const raw: string = client.handshake.headers?.cookie ?? '';
    const match = raw.match(/(?:^|;\s*)token=([^;]+)/);
    return match?.[1];
  }
}
