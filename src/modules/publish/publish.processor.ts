import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Process, Processor } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bull';
import { Repository } from 'typeorm';
import { ContentPost, ContentPostStatus } from '../ops/schedule/entities/content-post.entity';
import { ContentPublishAttempt } from '../ops/schedule/entities/content-publish-attempt.entity';
import { ContentPostProfile } from '../ops/campaigns/entities/content-post-profile.entity';
import { SocialProfile } from '../facebook/entities/SocialProfile.entity';
import { PlatformConnection } from '../inbox/entities/platform-connection.entity';
import type { InboxPlatform } from '../inbox/entities/inbox-contact.entity';
import { PlatformAdapterRegistry } from './platform-adapter.registry';
import { PostStatusChangedEvent } from '../../events/post-status-changed.event';

@Processor('publish')
@Injectable()
export class PublishProcessor {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    @InjectRepository(ContentPost)
    private readonly postRepo: Repository<ContentPost>,
    @InjectRepository(ContentPublishAttempt)
    private readonly attemptRepo: Repository<ContentPublishAttempt>,
    @InjectRepository(ContentPostProfile)
    private readonly profileRepo: Repository<ContentPostProfile>,
    @InjectRepository(SocialProfile)
    private readonly socialProfileRepo: Repository<SocialProfile>,
    @InjectRepository(PlatformConnection)
    private readonly connectionRepo: Repository<PlatformConnection>,
    private readonly registry: PlatformAdapterRegistry,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process()
  async handlePublish(job: Job<{ postId: string }>): Promise<void> {
    if (process.env.ENABLE_PUBLISH_PROCESSOR !== 'true') {
      this.logger.warn(
        'PublishProcessor is disabled — set ENABLE_PUBLISH_PROCESSOR=true to enable',
      );
      return;
    }

    const { postId } = job.data;

    // 1. Load post with workspace relation
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['workspace'],
    });
    if (!post) {
      this.logger.warn(`publish job: post=${postId} not found, skipping`);
      return;
    }

    // 2. Idempotency: only process scheduled posts
    if (post.status !== 'scheduled') {
      this.logger.log(
        `publish job: post=${postId} status=${post.status} — expected 'scheduled', skipping`,
      );
      return;
    }

    // 3. Transition to publishing (intermediate state)
    const from: ContentPostStatus = post.status;
    post.status = 'publishing';
    await this.postRepo.save(post);

    // 4. Load content-post-profiles with their SocialProfile
    const postProfiles = await this.profileRepo.find({
      where: { postId },
      relations: ['profile'],
    });

    let successCount = 0;
    let failCount = 0;

    for (const postProfile of postProfiles) {
      const socialProfile = postProfile.profile;

      if (!socialProfile) {
        this.logger.warn(
          `publish job: post=${postId} contentPostProfileId=${postProfile.id} — SocialProfile not loaded`,
        );
        await this.recordAttempt(postId, 'failed', null, 'SocialProfile not found');
        failCount++;
        continue;
      }

      // 4a. Find active PlatformConnection for (workspaceId, platform, externalProfileId)
      const connection = await this.connectionRepo.findOne({
        where: {
          workspaceId: post.workspaceId,
          platform: socialProfile.platform as InboxPlatform,
          externalProfileId: socialProfile.profileId,
          status: 'active',
        },
      });
      if (!connection) {
        this.logger.warn(
          `publish job: post=${postId} platform=${socialProfile.platform} profile=${socialProfile.profileId} — no active connection`,
        );
        await this.recordAttempt(postId, 'failed', null, 'No active platform connection');
        failCount++;
        continue;
      }

      // 4b-c. Get adapter (throws PlatformNotSupportedException for unsupported platforms)
      let adapter;
      try {
        adapter = this.registry.getAdapter(socialProfile.platform);
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(
          `publish job: post=${postId} platform=${socialProfile.platform} — adapter not found: ${msg}`,
        );
        await this.recordAttempt(postId, 'failed', null, msg);
        failCount++;
        continue;
      }

      // 4d-f. Publish and record outcome
      try {
        const result = await adapter.publishPost(socialProfile.profileId, {
          text: post.caption,
          mediaUrls: [],
          scheduledAt: undefined,
        });
        await this.recordAttempt(postId, 'published', result.platformPostId, null);
        successCount++;
        this.logger.debug(
          `publish job: post=${postId} platform=${socialProfile.platform} profile=${socialProfile.profileId} — ok platformPostId=${result.platformPostId}`,
        );
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.error(
          `publish job: post=${postId} platform=${socialProfile.platform} profile=${socialProfile.profileId} — failed: ${msg}`,
        );
        await this.recordAttempt(postId, 'failed', null, msg);
        failCount++;
      }
    }

    // 5. Set final post status
    const finalStatus: ContentPostStatus = successCount > 0 ? 'published' : 'failed';
    post.status = finalStatus;
    await this.postRepo.save(post);

    // 6. Emit PostStatusChangedEvent
    this.eventEmitter.emit(
      'post.status.changed',
      new PostStatusChangedEvent({
        workspaceId: post.workspaceId,
        postId,
        from,
        to: finalStatus,
        triggeredBy: 'publish-processor',
      }),
    );

    // 7. Log outcome summary
    this.logger.log(
      `publish job done: post=${postId} profiles=${postProfiles.length} success=${successCount} failed=${failCount} finalStatus=${finalStatus}`,
    );
  }

  private async recordAttempt(
    postId: string,
    status: string,
    externalId: string | null,
    error: string | null,
  ): Promise<void> {
    await this.attemptRepo.save(
      this.attemptRepo.create({ postId, status, externalId, error }),
    );
  }
}
