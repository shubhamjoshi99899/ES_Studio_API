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

export type InboxPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';

@Entity('inbox_contacts')
@Unique(['workspaceId', 'platform', 'externalId'])
@Index(['workspaceId'])
export class InboxContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'enum', enum: ['facebook', 'instagram', 'linkedin', 'tiktok'] })
  platform: InboxPlatform;

  @Column({ name: 'external_id', type: 'text' })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
