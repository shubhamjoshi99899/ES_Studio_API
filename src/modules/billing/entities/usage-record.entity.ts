import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
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

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt: Date;

  @Column({ name: 'stripe_usage_record_id', type: 'text', nullable: true })
  stripeUsageRecordId: string | null;
}
