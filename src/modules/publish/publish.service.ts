import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bull';
import { Repository } from 'typeorm';
import { ContentPost } from '../ops/schedule/entities/content-post.entity';
import { PostStatusChangedEvent } from '../../events/post-status-changed.event';

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    @InjectQueue('publish') private readonly publishQueue: Queue<{ postId: string }>,
    @InjectRepository(ContentPost)
    private readonly postRepo: Repository<ContentPost>,
  ) {}

  async schedulePost(postId: string, scheduledAt: Date): Promise<void> {
    const delay = scheduledAt.getTime() - Date.now();
    if (delay < 0) {
      throw new BadRequestException(
        `Cannot schedule post ${postId}: scheduledAt is in the past`,
      );
    }

    // Remove any existing pending job first (handles retry/reschedule)
    const existing = await this.publishQueue.getJob(postId);
    if (existing) {
      await existing.remove();
    }

    await this.publishQueue.add(
      { postId },
      {
        jobId: postId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Scheduled publish job for post=${postId} in ${delay}ms`);
  }

  async cancelScheduledPost(postId: string): Promise<void> {
    const job = await this.publishQueue.getJob(postId);
    if (job) {
      await job.remove();
      this.logger.log(`Cancelled publish job for post=${postId}`);
    }
  }

  @OnEvent('post.status.changed')
  async handleStatusChanged(event: PostStatusChangedEvent): Promise<void> {
    if (event.to === 'scheduled') {
      const post = await this.postRepo.findOne({ where: { id: event.postId } });
      if (!post?.scheduledAt) {
        this.logger.warn(
          `publish.service: post=${event.postId} transitioned to 'scheduled' but has no scheduledAt`,
        );
        return;
      }
      try {
        await this.schedulePost(post.id, post.scheduledAt);
      } catch (err) {
        this.logger.error(
          `publish.service: failed to enqueue post=${event.postId}: ${(err as Error).message}`,
        );
      }
    } else if (event.from === 'scheduled') {
      // Post moved away from scheduled externally — cancel pending Bull job
      await this.cancelScheduledPost(event.postId);
    }
  }
}
