import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PostStatusChangedEvent } from '../events/post-status-changed.event';

/** Stub listener — real consumers (alerts, notifications) added in Phase 2. */
@Injectable()
export class PostStatusChangedListener {
  private readonly logger = new Logger(PostStatusChangedListener.name);

  @OnEvent('post.status.changed')
  handle(event: PostStatusChangedEvent): void {
    this.logger.log(
      `[post.status.changed] workspace=${event.workspaceId} ` +
        `post=${event.postId} ${event.from} → ${event.to} by ${event.triggeredBy}`,
    );
  }
}
