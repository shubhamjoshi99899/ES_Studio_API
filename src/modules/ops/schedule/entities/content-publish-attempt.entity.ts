import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ContentPost } from './content-post.entity';

@Entity('content_publish_attempts')
@Index(['postId'])
export class ContentPublishAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => ContentPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: ContentPost;

  @CreateDateColumn({ name: 'attempted_at' })
  attemptedAt: Date;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId: string | null;
}
