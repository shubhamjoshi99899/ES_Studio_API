import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../../../workspaces/entities/workspace.entity';

export type MetricFamily = 'traffic' | 'revenue' | 'engagement';
export type AlertOperator = 'gt' | 'lt' | 'pct_drop' | 'pct_rise';
export type TimeWindow = '1d' | '7d' | '30d';

@Entity('alert_rules')
@Index(['workspaceId'])
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column()
  name: string;

  @Column({
    name: 'metric_family',
    type: 'enum',
    enum: ['traffic', 'revenue', 'engagement'],
  })
  metricFamily: MetricFamily;

  @Column({
    type: 'enum',
    enum: ['gt', 'lt', 'pct_drop', 'pct_rise'],
  })
  operator: AlertOperator;

  @Column({ type: 'numeric' })
  threshold: number;

  @Column({
    name: 'time_window',
    type: 'enum',
    enum: ['1d', '7d', '30d'],
  })
  timeWindow: TimeWindow;

  @Column('text', { array: true, default: '{}' })
  channels: string[];

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'last_evaluated', type: 'timestamp', nullable: true })
  lastEvaluated: Date | null;

  @Column({ name: 'last_triggered', type: 'timestamp', nullable: true })
  lastTriggered: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
