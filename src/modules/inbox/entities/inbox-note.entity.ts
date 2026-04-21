import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { InboxThread } from './inbox-thread.entity';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';

@Entity('inbox_notes')
@Index(['workspaceId'])
export class InboxNote {
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

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => WorkspaceUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: WorkspaceUser;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
