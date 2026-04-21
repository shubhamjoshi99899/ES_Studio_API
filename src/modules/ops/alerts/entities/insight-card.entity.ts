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

export type InsightSeverity = 'positive' | 'warning' | 'critical' | 'neutral';

@Entity('insight_cards')
@Index(['workspaceId'])
@Index(['expiresAt'])
export class InsightCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column()
  type: string;

  @Column({
    type: 'enum',
    enum: ['positive', 'warning', 'critical', 'neutral'],
    default: 'neutral',
  })
  severity: InsightSeverity;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // 30-day flat expiry per spec; null = never expires
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;
}
