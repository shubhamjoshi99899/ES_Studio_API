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

@Entity('usage_records')
@Index(['workspaceId'])
@Index(['workspaceId', 'metric'])
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'text' })
  metric: string;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ name: 'recorded_at', type: 'timestamp' })
  recordedAt: Date;

  @Column({ name: 'stripe_usage_record_id', type: 'text', nullable: true })
  stripeUsageRecordId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
