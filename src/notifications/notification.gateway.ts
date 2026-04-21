import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

// ---------------------------------------------------------------------------
// Shared event shape — every emitter uses this contract
// ---------------------------------------------------------------------------
export interface NotificationEvent {
  type: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Gateway interface — both transports must satisfy this
// ---------------------------------------------------------------------------
export interface INotificationGateway {
  sendToWorkspace(workspaceId: string, event: NotificationEvent): Promise<void>;
  sendToUser(userId: string, event: NotificationEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// SSE implementation
// ---------------------------------------------------------------------------
@Injectable()
export class SseNotificationGateway implements INotificationGateway {
  private readonly logger = new Logger(SseNotificationGateway.name);

  // Map<workspaceId, Response[]>
  // Each Response is one open SSE connection for that workspace.
  private readonly connections = new Map<string, Response[]>();

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Register a new SSE connection for a workspace.
   * Sets up heartbeat and removes the connection from the map on client close.
   * Returns the heartbeat interval handle so callers don't need to manage it.
   */
  register(workspaceId: string, res: Response): void {
    if (!this.connections.has(workspaceId)) {
      this.connections.set(workspaceId, []);
    }
    this.connections.get(workspaceId)!.push(res);
    this.logger.debug(
      `SSE connect  workspace=${workspaceId} total=${this.connections.get(workspaceId)!.length}`,
    );

    // 30-second heartbeat — keeps proxies from closing idle connections
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        // write failed — connection already gone; cleanup handles it
      }
    }, 30_000);
    heartbeat.unref();

    // Cleanup: remove this exact Response reference on disconnect.
    // We splice by reference (indexOf) so we never remove the wrong entry
    // if the same workspace has multiple concurrent connections.
    res.on('close', () => {
      clearInterval(heartbeat);
      const list = this.connections.get(workspaceId);
      if (list) {
        const idx = list.indexOf(res);
        if (idx !== -1) {
          list.splice(idx, 1);
        }
        // Remove the workspace key entirely once no connections remain
        if (list.length === 0) {
          this.connections.delete(workspaceId);
        }
      }
      this.logger.debug(
        `SSE disconnect workspace=${workspaceId} remaining=${this.connections.get(workspaceId)?.length ?? 0}`,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Send helpers
  // ---------------------------------------------------------------------------

  async sendToWorkspace(workspaceId: string, event: NotificationEvent): Promise<void> {
    const list = this.connections.get(workspaceId);
    if (!list || list.length === 0) return;

    const data = this.serialize(event);
    // Iterate over a shallow copy so a mid-loop close cannot shift indices
    for (const res of [...list]) {
      try {
        res.write(data);
      } catch (err) {
        this.logger.warn(`SSE write failed workspace=${workspaceId}: ${err}`);
      }
    }
  }

  async sendToUser(userId: string, event: NotificationEvent): Promise<void> {
    // User-level targeting is handled by the controller layer which knows the
    // workspaceId for the authenticated user.  At the SSE transport level we
    // send to the workspace; user-id filtering (if needed) is done client-side.
    this.logger.warn(
      `SseNotificationGateway.sendToUser called for userId=${userId} — SSE is workspace-scoped; use sendToWorkspace instead`,
    );
  }

  // ---------------------------------------------------------------------------
  // Diagnostics (test / admin use)
  // ---------------------------------------------------------------------------
  connectionCount(workspaceId: string): number {
    return this.connections.get(workspaceId)?.length ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------
  private serialize(event: NotificationEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }
}

// ---------------------------------------------------------------------------
// WebSocket stub — Phase 4
// ---------------------------------------------------------------------------
@Injectable()
export class WebSocketNotificationGateway implements INotificationGateway {
  async sendToWorkspace(_workspaceId: string, _event: NotificationEvent): Promise<void> {
    throw new Error('WebSocket gateway not implemented — Phase 4');
  }

  async sendToUser(_userId: string, _event: NotificationEvent): Promise<void> {
    throw new Error('WebSocket gateway not implemented — Phase 4');
  }
}
