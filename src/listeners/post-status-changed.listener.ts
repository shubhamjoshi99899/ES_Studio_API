import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostStatusChangedEvent } from '../events/post-status-changed.event';
import { AlertEngineService } from '../modules/ops/alerts/alert-engine.service';
import { InAppNotification } from '../modules/ops/alerts/entities/in-app-notification.entity';
import type { INotificationGateway, NotificationEvent } from '../notifications/notification.gateway';

@Injectable()
export class PostStatusChangedListener {
  private readonly logger = new Logger(PostStatusChangedListener.name);

  constructor(
    private readonly alertEngine: AlertEngineService,
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    @Inject('NOTIFICATION_GATEWAY')
    private readonly gateway: INotificationGateway,
  ) {}

  @OnEvent('post.status.changed')
  async handle(event: PostStatusChangedEvent): Promise<void> {
    const body = `Post moved from ${event.from} to ${event.to}`;

    try {
      await this.alertEngine.evaluateWorkspace(event.workspaceId);
    } catch (error) {
      this.logger.error(
        `Alert evaluation failed for workspace=${event.workspaceId}: ${this.getErrorMessage(error)}`,
      );
    }

    try {
      const notification = this.notificationRepo.create({
        workspaceId: event.workspaceId,
        userId: null,
        type: 'post_status_changed',
        title: 'Post status updated',
        body,
      });
      await this.notificationRepo.save(notification);
    } catch (error) {
      this.logger.error(
        `Failed to store post status notification for workspace=${event.workspaceId}: ${this.getErrorMessage(error)}`,
      );
    }

    try {
      const payload: NotificationEvent = {
        type: 'post_status_changed',
        title: 'Post status updated',
        body,
        createdAt: new Date(),
      };
      await this.gateway.sendToWorkspace(event.workspaceId, payload);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast post status change for workspace=${event.workspaceId}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
