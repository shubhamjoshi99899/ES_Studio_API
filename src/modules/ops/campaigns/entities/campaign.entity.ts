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

export type CampaignStatus = 'draft' | 'active' | 'completed';

@Entity('campaigns')
@Index(['workspaceId'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column()
  name: string;

  @Column()
  objective: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'active', 'completed'],
    default: 'draft',
  })
  status: CampaignStatus;

  @Column('text', { array: true, default: '{}' })
  platforms: string[];

  @Column({ type: 'numeric', nullable: true })
  budget: number | null;

  @Column({ type: 'numeric', default: 0 })
  spend: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
