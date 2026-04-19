import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Campaign } from './campaign.entity';
import { ContentPost } from '../../schedule/entities/content-post.entity';

@Entity('campaign_post_links')
export class CampaignPostLink {
  @PrimaryColumn({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => ContentPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: ContentPost;
}
