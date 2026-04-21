import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { InboxContact } from './inbox-contact.entity';
import type { InboxPlatform } from './inbox-contact.entity';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';

export type InboxThreadStatus = 'open' | 'pending' | 'resolved' | 'snoozed';

@Entity('inbox_threads')
@Unique(['workspaceId', 'platform', 'externalThreadId'])
@Index(['workspaceId'])
@Index(['workspaceId', 'status', 'lastMessageAt'])
export class InboxThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'enum', enum: ['facebook', 'instagram', 'linkedin', 'tiktok'] })
  platform: InboxPlatform;

  @Column({ name: 'external_thread_id', type: 'text' })
  externalThreadId: string;

  @Column({ name: 'external_profile_id', type: 'text' })
  externalProfileId: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => InboxContact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact: InboxContact | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @ManyToOne(() => WorkspaceUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedToUser: WorkspaceUser | null;

  @Column({
    type: 'enum',
    enum: ['open', 'pending', 'resolved', 'snoozed'],
    default: 'open',
  })
  status: InboxThreadStatus;

  @Column({ name: 'last_message_at', type: 'timestamp', default: () => 'now()' })
  lastMessageAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
