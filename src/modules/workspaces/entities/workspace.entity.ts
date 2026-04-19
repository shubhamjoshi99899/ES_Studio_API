import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkspaceUser } from './workspace-user.entity';
import { WorkspaceInvite } from './workspace-invite.entity';

export type WorkspacePlan = 'starter' | 'pro' | 'enterprise';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: ['starter', 'pro', 'enterprise'],
    default: 'starter',
  })
  plan: WorkspacePlan;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @OneToMany(() => WorkspaceUser, (wu) => wu.workspace)
  members: WorkspaceUser[];

  @OneToMany(() => WorkspaceInvite, (wi) => wi.workspace)
  invites: WorkspaceInvite[];
}
