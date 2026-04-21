import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { InboxThread } from './inbox-thread.entity';

export type InboxMessageDirection = 'inbound' | 'outbound';

@Entity('inbox_messages')
@Unique(['threadId', 'externalMessageId'])
@Index(['workspaceId'])
@Index(['threadId', 'createdAt'])
export class InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @ManyToOne(() => InboxThread, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread: InboxThread;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'external_message_id', type: 'text' })
  externalMessageId: string;

  @Column({ type: 'enum', enum: ['inbound', 'outbound'] })
  direction: InboxMessageDirection;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'media_urls', type: 'text', array: true, nullable: true })
  mediaUrls: string[] | null;

  @Column({ name: 'sender_external_id', type: 'text' })
  senderExternalId: string;

  @Column({ name: 'sender_name', type: 'text', nullable: true })
  senderName: string | null;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
