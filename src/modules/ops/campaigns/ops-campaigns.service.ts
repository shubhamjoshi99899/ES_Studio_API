import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignPostLink } from './entities/campaign-post-link.entity';
import { ContentPost } from '../schedule/entities/content-post.entity';
import { AuditService } from '../../../common/audit/audit.service';

@Injectable()
export class OpsCampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignPostLink)
    private readonly linkRepo: Repository<CampaignPostLink>,
    @InjectRepository(ContentPost)
    private readonly postRepo: Repository<ContentPost>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async createCampaign(workspaceId: string, body: any): Promise<Campaign> {
    const campaign = this.campaignRepo.create({
      workspaceId,
      ...(body as Partial<Campaign>),
    });
    const saved = await this.campaignRepo.save(campaign);
    await this.auditService.log({
      workspaceId,
      actorId: body.actorId ?? null,
      action: 'campaign.create',
      entityType: 'campaign',
      entityId: saved.id,
      payload: { name: saved.name },
    });
    return saved;
  }

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    return this.campaignRepo.find({ where: { workspaceId } });
  }

  async getCampaign(
    workspaceId: string,
    id: string,
  ): Promise<Campaign & { metrics: Record<string, number> }> {
    const campaign = await this.campaignRepo.findOne({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    // Performance metrics via raw SQL to join analytics tables
    //
    // total_reach:
    //   SELECT SUM(a."totalImpressions")
    //   FROM campaign_post_links cpl
    //   JOIN content_posts cp ON cp.id = cpl.post_id AND cp.workspace_id = $2
    //   JOIN content_post_profiles cpp ON cpp.post_id = cp.id
    //   JOIN social_profiles sp ON sp.id = cpp.profile_id
    //   JOIN analytics_snapshots a ON a."profileId" = sp."profileId"
    //   WHERE cpl.campaign_id = $1 AND cp.status = 'published'
    //
    // total_revenue:
    //   SELECT SUM(dr."totalRevenue")
    //   FROM campaign_post_links cpl
    //   JOIN content_posts cp ON cp.id = cpl.post_id AND cp.workspace_id = $2
    //   JOIN content_post_profiles cpp ON cpp.post_id = cp.id
    //   JOIN social_profiles sp ON sp.id = cpp.profile_id
    //   JOIN daily_revenue dr ON dr."pageId" = sp."profileId"
    //   WHERE cpl.campaign_id = $1 AND cp.status = 'published'
    const [metrics] = await this.dataSource.query<
      Array<{
        total_posts: string;
        published_posts: string;
        total_reach: string;
        total_revenue: string;
      }>
    >(
      `
      SELECT
        COUNT(cpl.post_id)::int                                             AS total_posts,
        COUNT(cp.id) FILTER (WHERE cp.status = 'published')::int            AS published_posts,

        COALESCE((
          SELECT SUM(a."totalImpressions")
          FROM content_posts cp2
          JOIN content_post_profiles cpp ON cpp.post_id = cp2.id
          JOIN social_profiles sp       ON sp.id        = cpp.profile_id
          JOIN analytics_snapshots a    ON a."profileId" = sp."profileId"
          WHERE cp2.id IN (
            SELECT cpl2.post_id FROM campaign_post_links cpl2 WHERE cpl2.campaign_id = $1
          )
          AND cp2.workspace_id = $2
          AND cp2.status = 'published'
        ), 0)::int                                                           AS total_reach,

        COALESCE((
          SELECT SUM(dr."totalRevenue")
          FROM content_posts cp3
          JOIN content_post_profiles cpp2 ON cpp2.post_id  = cp3.id
          JOIN social_profiles sp2        ON sp2.id        = cpp2.profile_id
          JOIN daily_revenue dr           ON dr."pageId"   = sp2."profileId"
          WHERE cp3.id IN (
            SELECT cpl3.post_id FROM campaign_post_links cpl3 WHERE cpl3.campaign_id = $1
          )
          AND cp3.workspace_id = $2
          AND cp3.status = 'published'
        ), 0)::numeric                                                       AS total_revenue

      FROM campaign_post_links cpl
      LEFT JOIN content_posts cp
        ON cp.id = cpl.post_id AND cp.workspace_id = $2
      WHERE cpl.campaign_id = $1
      `,
      [id, workspaceId],
    );

    return {
      ...campaign,
      metrics: {
        total_posts:     Number(metrics?.total_posts ?? 0),
        published_posts: Number(metrics?.published_posts ?? 0),
        total_reach:     Number(metrics?.total_reach ?? 0),
        total_revenue:   Number(metrics?.total_revenue ?? 0),
      },
    };
  }

  async updateCampaign(
    workspaceId: string,
    id: string,
    body: any,
  ): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    Object.assign(campaign, body);
    const saved = await this.campaignRepo.save(campaign);
    await this.auditService.log({
      workspaceId,
      actorId: body.actorId ?? null,
      action: 'campaign.update',
      entityType: 'campaign',
      entityId: saved.id,
      payload: body,
    });
    return saved;
  }

  async deleteCampaign(workspaceId: string, id: string): Promise<void> {
    const campaign = await this.campaignRepo.findOne({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    await this.campaignRepo.remove(campaign);
    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'campaign.delete',
      entityType: 'campaign',
      entityId: id,
      payload: {},
    });
  }

  // -------------------------------------------------------------------------
  // Post linking
  // -------------------------------------------------------------------------

  async linkPost(
    workspaceId: string,
    campaignId: string,
    postId: string,
  ): Promise<void> {
    // Validate both campaign and post belong to this workspace
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const post = await this.postRepo.findOne({
      where: { id: postId, workspaceId },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.linkRepo.findOne({
      where: { campaignId, postId },
    });
    if (existing) throw new BadRequestException('Post already linked to campaign');

    await this.linkRepo.save(this.linkRepo.create({ campaignId, postId }));
    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'campaign.post.link',
      entityType: 'campaign_post_link',
      entityId: campaignId,
      payload: { postId },
    });
  }

  async unlinkPost(
    workspaceId: string,
    campaignId: string,
    postId: string,
  ): Promise<void> {
    // Validate campaign belongs to this workspace
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const link = await this.linkRepo.findOne({ where: { campaignId, postId } });
    if (!link) throw new NotFoundException('Link not found');

    await this.linkRepo.remove(link);
    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'campaign.post.unlink',
      entityType: 'campaign_post_link',
      entityId: campaignId,
      payload: { postId },
    });
  }
}
