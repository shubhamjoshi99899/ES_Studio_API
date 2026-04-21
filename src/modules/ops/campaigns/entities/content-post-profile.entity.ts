import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ContentPost } from '../../schedule/entities/content-post.entity';
import { SocialProfile } from '../../../facebook/entities/SocialProfile.entity';

@Entity('content_post_profiles')
@Unique(['postId', 'profileId'])
@Index(['postId'])
@Index(['profileId'])
export class ContentPostProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => ContentPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: ContentPost;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => SocialProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: SocialProfile;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
