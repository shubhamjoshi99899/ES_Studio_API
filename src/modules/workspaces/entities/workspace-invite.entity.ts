import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';

export type WorkspaceInviteRole = 'admin' | 'analyst' | 'content_manager';

@Entity('workspace_invites')
export class WorkspaceInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, (w) => w.invites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Index()
  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: ['admin', 'analyst', 'content_manager'],
    default: 'analyst',
  })
  role: WorkspaceInviteRole;

  /** Stored as a bcrypt hash; never returned in responses. */
  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', nullable: true, type: 'timestamp' })
  acceptedAt: Date | null;
}
