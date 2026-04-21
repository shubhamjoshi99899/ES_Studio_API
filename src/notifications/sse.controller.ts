import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspaceId } from '../common/decorators/workspace-id.decorator';
import { SseNotificationGateway } from './notification.gateway';

@Controller('api/ops/notifications')
@UseGuards(JwtAuthGuard)
export class SseController {
  constructor(
    @Inject('NOTIFICATION_GATEWAY')
    private readonly gateway: SseNotificationGateway,
  ) {}

  /**
   * GET /api/ops/notifications/stream
   *
   * Opens a persistent SSE connection for the authenticated workspace.
   * The client receives JSON-encoded NotificationEvent objects as they fire.
   *
   * Lifecycle:
   *   1. Response headers set → SSE stream open
   *   2. gateway.register() adds this Response to the workspace connection map
   *      and starts the 30-second heartbeat interval
   *   3. On req 'close' (client disconnect / proxy timeout):
   *      - heartbeat interval cleared (inside gateway.register close handler)
   *      - Response removed from the connection map by reference
   *      - workspace key deleted when map reaches zero connections
   *   No memory leak path: every Response added to the map has a corresponding
   *   removal registered via res.on('close') before control returns.
   */
  @Get('stream')
  stream(
    @WorkspaceId() workspaceId: string,
    @Res() res: Response,
  ): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Register → heartbeat starts → cleanup wired before this returns
    this.gateway.register(workspaceId, res);
  }
}
