import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ContentPost } from './content-post.entity';
import { WorkspaceUser } from '../../../workspaces/entities/workspace-user.entity';

export type PostApprovalAction = 'approved' | 'rejected' | 'requested_changes';

@Entity('content_post_approvals')
@Index(['postId'])
export class ContentPostApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => ContentPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: ContentPost;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId: string;

  @ManyToOne(() => WorkspaceUser, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: WorkspaceUser;

  @Column({
    type: 'enum',
    enum: ['approved', 'rejected', 'requested_changes'],
  })
  action: PostApprovalAction;

  @Column({ type: 'text', default: '' })
  note: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
