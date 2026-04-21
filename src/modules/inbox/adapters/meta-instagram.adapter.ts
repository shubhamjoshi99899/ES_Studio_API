import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';

const GRAPH_API = 'https://graph.facebook.com/v18.0';

@Injectable()
export class MetaInstagramAdapter implements IPlatformInboxAdapter {
  readonly platform = 'instagram' as const;
  private readonly logger = new Logger(MetaInstagramAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  // ── Credential lookup ────────────────────────────────────────────────────

  private async getAccessToken(profileId: string): Promise<string> {
    const [row] = await this.dataSource.query<Array<{ access_token: string }>>(
      `SELECT access_token FROM platform_connections
       WHERE external_profile_id = $1 AND platform = 'instagram' AND status = 'active'
       LIMIT 1`,
      [profileId],
    );
    if (!row) throw new Error(`No active Instagram connection for profile ${profileId}`);
    return row.access_token;
  }

  // ── IPlatformInboxAdapter ────────────────────────────────────────────────

  async fetchThreads(profileId: string, since: Date): Promise<InboxThread[]> {
    const token = await this.getAccessToken(profileId);
    const sinceUnix = Math.floor(since.getTime() / 1000);

    // https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
    const { data } = await axios.get(`${GRAPH_API}/${profileId}/conversations`, {
      params: {
        fields: 'id,participants,updated_time,messages{id,message,from,created_time,attachments}',
        since: sinceUnix,
        access_token: token,
        platform: 'instagram',
      },
    });

    const threads: InboxThread[] = [];
    for (const conv of (data.data ?? []) as any[]) {
      const participant = (conv.participants?.data ?? []).find(
        (p: any) => p.id !== profileId,
      );
      const messages: InboxMessage[] = (conv.messages?.data ?? []).map((m: any) => ({
        externalThreadId: conv.id,
        externalMessageId: m.id,
        direction: (m.from?.id === profileId ? 'outbound' : 'inbound') as 'inbound' | 'outbound',
        body: m.message ?? '',
        mediaUrls: m.attachments?.data?.map((a: any) => a.image_data?.url ?? a.file_url).filter(Boolean),
        senderExternalId: m.from?.id ?? '',
        senderName: m.from?.name ?? undefined,
        sentAt: new Date(m.created_time),
      }));

      threads.push({
        externalThreadId: conv.id,
        externalProfileId: profileId,
        contact: {
          externalId: participant?.id ?? '',
          name: participant?.name ?? undefined,
        },
        messages,
        lastMessageAt: new Date(conv.updated_time),
      });
    }
    return threads;
  }

  async fetchMessages(threadId: string, since: Date): Promise<InboxMessage[]> {
    this.logger.warn(`fetchMessages called for Instagram thread ${threadId} — use fetchThreads for full context`);
    return [];
  }

  async sendReply(
    threadId: string,
    body: string,
  ): Promise<{ externalMessageId: string }> {
    // Instagram Messaging Send API
    // https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
    // threadId format: "igUserId::recipientIgsid::accessToken"
    const [igUserId, recipientId, token] = threadId.split('::');
    if (!recipientId || !token) {
      throw new Error(
        'Instagram sendReply requires threadId in format "igUserId::recipientId::accessToken"',
      );
    }

    const { data } = await axios.post(
      `${GRAPH_API}/${igUserId}/messages`,
      {
        recipient: { id: recipientId },
        message: { text: body },
      },
      { params: { access_token: token } },
    );
    return { externalMessageId: data.message_id };
  }

  async markAsRead(threadId: string, messageId: string): Promise<void> {
    const [igUserId, recipientId, token] = threadId.split('::');
    if (!recipientId || !token) return;
    await axios.post(
      `${GRAPH_API}/${igUserId}/messages`,
      { recipient: { id: recipientId }, sender_action: 'mark_seen' },
      { params: { access_token: token } },
    ).catch((err) => {
      this.logger.warn(`markAsRead failed for message ${messageId}: ${err.message}`);
    });
  }
}
