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
import type { InboxPlatform } from './inbox-contact.entity';

export type PlatformConnectionStatus = 'active' | 'error' | 'disconnected';

@Entity('platform_connections')
@Unique(['workspaceId', 'platform', 'externalProfileId'])
@Index(['workspaceId'])
export class PlatformConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'enum', enum: ['facebook', 'instagram', 'linkedin', 'tiktok'] })
  platform: InboxPlatform;

  @Column({ name: 'external_profile_id', type: 'text' })
  externalProfileId: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({
    type: 'enum',
    enum: ['active', 'error', 'disconnected'],
    default: 'active',
  })
  status: PlatformConnectionStatus;

  @Column({ name: 'token_expires_at', type: 'timestamp', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
