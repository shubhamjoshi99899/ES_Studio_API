import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';

export type SubscriptionPlan   = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

@Entity('workspace_subscriptions')
@Index(['workspaceId'])
export class WorkspaceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid', unique: true })
  workspaceId: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'stripe_customer_id', type: 'text', unique: true, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'text', nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  @Column({ name: 'stripe_price_id', type: 'text', nullable: true })
  stripePriceId: string | null;

  @Column({
    type: 'enum',
    enum: ['starter', 'pro', 'enterprise'],
    default: 'starter',
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: ['active', 'past_due', 'cancelled', 'trialing'],
    default: 'trialing',
  })
  status: SubscriptionStatus;

  @Column({ name: 'current_period_start', type: 'timestamp', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamp', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ name: 'cancel_at', type: 'timestamp', nullable: true })
  cancelAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
