import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import type { IPlatformPublishAdapter, PublishPostParams } from './publish-adapter.interface';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

@Injectable()
export class MetaPublishAdapter implements IPlatformPublishAdapter {
  private readonly logger = new Logger(MetaPublishAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async publishPost(
    externalProfileId: string,
    params: PublishPostParams,
  ): Promise<{ platformPostId: string }> {
    const conn = await this.getConnection(externalProfileId);

    if (conn.platform === 'instagram') {
      return this.publishInstagram(externalProfileId, conn.access_token, params);
    }
    return this.publishFacebook(externalProfileId, conn.access_token, params);
  }

  private async getConnection(
    externalProfileId: string,
  ): Promise<{ access_token: string; platform: string }> {
    const [row] = await this.dataSource.query<
      Array<{ access_token: string; platform: string }>
    >(
      `SELECT access_token, platform FROM platform_connections
       WHERE external_profile_id = $1
         AND platform IN ('facebook', 'instagram')
         AND status = 'active'
       LIMIT 1`,
      [externalProfileId],
    );
    if (!row) {
      throw new Error(`No active Meta connection for profile ${externalProfileId}`);
    }
    return row;
  }

  private async publishFacebook(
    pageId: string,
    token: string,
    params: PublishPostParams,
  ): Promise<{ platformPostId: string }> {
    const { data } = await axios.post(
      `${GRAPH_API}/${pageId}/feed`,
      { message: params.text },
      { params: { access_token: token } },
    );
    this.logger.debug(`Facebook published pageId=${pageId} postId=${data.id}`);
    return { platformPostId: data.id as string };
  }

  private async publishInstagram(
    igUserId: string,
    token: string,
    params: PublishPostParams,
  ): Promise<{ platformPostId: string }> {
    const mediaUrl = params.mediaUrls[0];
    if (!mediaUrl) {
      throw new Error('Instagram publishing requires at least one media URL');
    }
    const { data: container } = await axios.post(
      `${GRAPH_API}/${igUserId}/media`,
      { image_url: mediaUrl, caption: params.text },
      { params: { access_token: token } },
    );
    const { data } = await axios.post(
      `${GRAPH_API}/${igUserId}/media_publish`,
      { creation_id: container.id as string },
      { params: { access_token: token } },
    );
    this.logger.debug(`Instagram published igUserId=${igUserId} postId=${data.id}`);
    return { platformPostId: data.id as string };
  }
}
