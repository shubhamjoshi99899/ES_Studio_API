import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from '../../auth/entities/user.entity';

export type WorkspaceUserRole   = 'admin' | 'analyst' | 'content_manager';
export type WorkspaceUserStatus = 'invited' | 'active' | 'suspended';

@Entity('workspace_users')
@Index(['workspaceId', 'userId'])
export class WorkspaceUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, (w) => w.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: ['admin', 'analyst', 'content_manager'],
    default: 'analyst',
  })
  role: WorkspaceUserRole;

  @Column({
    type: 'enum',
    enum: ['invited', 'active', 'suspended'],
    default: 'invited',
  })
  status: WorkspaceUserStatus;

  @Column({ name: 'invited_by', nullable: true, type: 'uuid' })
  invitedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by' })
  invitedByUser: User | null;

  @CreateDateColumn({ name: 'invited_at' })
  invitedAt: Date;

  @Column({ name: 'accepted_at', nullable: true, type: 'timestamp' })
  acceptedAt: Date | null;
}
