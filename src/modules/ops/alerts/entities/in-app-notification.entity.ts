import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../../../workspaces/entities/workspace.entity';

@Entity('in_app_notifications')
@Index(['workspaceId'])
@Index(['workspaceId', 'userId', 'readAt'])
export class InAppNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  // null = broadcast to entire workspace
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
