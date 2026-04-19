import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentPost, ContentPostStatus } from './entities/content-post.entity';
import { ContentPostApproval } from './entities/content-post-approval.entity';
import { PostStatusChangedEvent } from '../../../events/post-status-changed.event';
import { AuditService } from '../../../common/audit/audit.service';

// ---------------------------------------------------------------------------
// Explicit state machine: action → { allowedFromStatus → nextStatus }
// ---------------------------------------------------------------------------
const TRANSITIONS: Record<
  string,
  Partial<Record<ContentPostStatus, ContentPostStatus>>
> = {
  submitForReview: { draft: 'review' },
  approve:         { review: 'approved' },
  reject:          { review: 'draft' },
  schedule:        { approved: 'scheduled' },
  markPublished:   { scheduled: 'published' },
  markFailed:      { scheduled: 'failed' },
  retry:           { failed: 'scheduled' },
};

@Injectable()
export class OpsScheduleService {
  constructor(
    @InjectRepository(ContentPost)
    private readonly postRepo: Repository<ContentPost>,
    @InjectRepository(ContentPostApproval)
    private readonly approvalRepo: Repository<ContentPostApproval>,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async createPost(workspaceId: string, body: any): Promise<ContentPost> {
    const post = this.postRepo.create({
      workspaceId,
      ...(body as Partial<ContentPost>),
    });
    const saved = await this.postRepo.save(post);
    await this.auditService.log({
      workspaceId,
      actorId: body.ownerId ?? null,
      action: 'content_post.create',
      entityType: 'content_post',
      entityId: saved.id,
      payload: { title: saved.title, status: saved.status },
    });
    return saved;
  }

  async listPosts(workspaceId: string): Promise<ContentPost[]> {
    return this.postRepo.find({ where: { workspaceId } });
  }

  async getPost(workspaceId: string, id: string): Promise<ContentPost> {
    const post = await this.postRepo.findOne({ where: { id, workspaceId } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async updatePost(
    workspaceId: string,
    id: string,
    body: any,
  ): Promise<ContentPost> {
    const post = await this.getPost(workspaceId, id);
    Object.assign(post, body);
    const saved = await this.postRepo.save(post);
    await this.auditService.log({
      workspaceId,
      actorId: body.actorId ?? null,
      action: 'content_post.update',
      entityType: 'content_post',
      entityId: saved.id,
      payload: body,
    });
    return saved;
  }

  async deletePost(workspaceId: string, id: string): Promise<void> {
    const post = await this.getPost(workspaceId, id);
    await this.postRepo.remove(post);
    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'content_post.delete',
      entityType: 'content_post',
      entityId: id,
      payload: {},
    });
  }

  // -------------------------------------------------------------------------
  // State machine transitions
  // -------------------------------------------------------------------------

  async submitForReview(
    workspaceId: string,
    id: string,
    triggeredBy: string,
  ): Promise<ContentPost> {
    return this.applyTransition(workspaceId, id, 'submitForReview', triggeredBy);
  }

  async approvePost(
    workspaceId: string,
    id: string,
    triggeredBy: string,
    reviewerId?: string,
    note?: string,
  ): Promise<ContentPost> {
    const post = await this.applyTransition(
      workspaceId,
      id,
      'approve',
      triggeredBy,
    );
    if (reviewerId) {
      await this.approvalRepo.save(
        this.approvalRepo.create({
          postId: id,
          reviewerId,
          action: 'approved',
          note: note ?? '',
        }),
      );
    }
    return post;
  }

  async rejectPost(
    workspaceId: string,
    id: string,
    body: { reviewerId?: string; note?: string; triggeredBy?: string },
  ): Promise<ContentPost> {
    const triggeredBy = body.triggeredBy ?? workspaceId;
    const post = await this.applyTransition(
      workspaceId,
      id,
      'reject',
      triggeredBy,
    );
    if (body.reviewerId) {
      await this.approvalRepo.save(
        this.approvalRepo.create({
          postId: id,
          reviewerId: body.reviewerId,
          action: 'rejected',
          note: body.note ?? '',
        }),
      );
    }
    return post;
  }

  async schedulePost(
    workspaceId: string,
    id: string,
    body: { scheduledAt: string; triggeredBy?: string },
  ): Promise<ContentPost> {
    const scheduledAt = new Date(body.scheduledAt);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new BadRequestException(
        'scheduledAt must be a valid future timestamp',
      );
    }
    const triggeredBy = body.triggeredBy ?? workspaceId;
    return this.applyTransition(workspaceId, id, 'schedule', triggeredBy, {
      scheduledAt,
    });
  }

  async markPublished(
    workspaceId: string,
    id: string,
    triggeredBy: string,
  ): Promise<ContentPost> {
    return this.applyTransition(
      workspaceId,
      id,
      'markPublished',
      triggeredBy,
    );
  }

  async markFailed(
    workspaceId: string,
    id: string,
    triggeredBy: string,
  ): Promise<ContentPost> {
    return this.applyTransition(workspaceId, id, 'markFailed', triggeredBy);
  }

  async retry(
    workspaceId: string,
    id: string,
    triggeredBy: string,
  ): Promise<ContentPost> {
    return this.applyTransition(workspaceId, id, 'retry', triggeredBy);
  }

  // -------------------------------------------------------------------------
  // Private: core transition executor
  // -------------------------------------------------------------------------

  private async applyTransition(
    workspaceId: string,
    postId: string,
    action: string,
    triggeredBy: string,
    extra?: Partial<ContentPost>,
  ): Promise<ContentPost> {
    const post = await this.postRepo.findOne({
      where: { id: postId, workspaceId },
    });
    if (!post) throw new NotFoundException('Post not found');

    const allowed = TRANSITIONS[action];
    const nextStatus = allowed?.[post.status];

    if (!nextStatus) {
      throw new BadRequestException(
        `Invalid transition: '${post.status}' → '${action}'`,
      );
    }

    const from = post.status;
    Object.assign(post, { status: nextStatus, ...extra });
    await this.postRepo.save(post);

    this.eventEmitter.emit(
      'post.status.changed',
      new PostStatusChangedEvent({ workspaceId, postId, from, to: nextStatus, triggeredBy }),
    );

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: `content_post.${action}`,
      entityType: 'content_post',
      entityId: postId,
      payload: { from, to: nextStatus, triggeredBy },
    });

    return post;
  }
}
