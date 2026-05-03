import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../../../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../../../workspaces/entities/workspace-user.entity';

export type ContentPostStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

@Entity('content_posts')
@Index(['workspaceId'])
export class ContentPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  caption: string;

  @Column('text', { array: true, default: '{}' })
  hashtags: string[];

  @Column('text', { array: true, default: '{}' })
  platforms: string[];

  @Column({ name: 'media_type', default: '' })
  mediaType: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => WorkspaceUser, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: WorkspaceUser;

  @Column({ name: 'approval_owner', type: 'uuid', nullable: true })
  approvalOwner: string | null;

  @ManyToOne(() => WorkspaceUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approval_owner' })
  approvalOwnerUser: WorkspaceUser | null;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'review', 'approved', 'scheduled', 'publishing', 'published', 'failed'],
    default: 'draft',
  })
  status: ContentPostStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
