import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';

const GRAPH_API = 'https://graph.facebook.com/v18.0';

@Injectable()
export class MetaFacebookAdapter implements IPlatformInboxAdapter {
  readonly platform = 'facebook' as const;
  private readonly logger = new Logger(MetaFacebookAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  // ── Credential lookup ────────────────────────────────────────────────────

  private async getAccessToken(profileId: string): Promise<string> {
    const [row] = await this.dataSource.query<Array<{ access_token: string }>>(
      `SELECT access_token FROM platform_connections
       WHERE external_profile_id = $1 AND platform = 'facebook' AND status = 'active'
       LIMIT 1`,
      [profileId],
    );
    if (!row) throw new Error(`No active Facebook connection for profile ${profileId}`);
    return row.access_token;
  }

  // ── IPlatformInboxAdapter ────────────────────────────────────────────────

  async fetchThreads(profileId: string, since: Date): Promise<InboxThread[]> {
    const token = await this.getAccessToken(profileId);
    const sinceUnix = Math.floor(since.getTime() / 1000);

    // https://developers.facebook.com/docs/messenger-platform/reference/conversation-api
    const { data } = await axios.get(`${GRAPH_API}/me/conversations`, {
      params: {
        fields: 'id,participants,updated_time,messages{id,message,from,created_time,attachments}',
        since: sinceUnix,
        access_token: token,
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
        mediaUrls: m.attachments?.data?.map((a: any) => a.image_data?.url).filter(Boolean),
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
    // Note: profileId not available here; use a stored token via thread lookup in real usage.
    // For now, thread participants must include the page — caller provides access_token via context.
    this.logger.warn(`fetchMessages called for Facebook thread ${threadId} — use fetchThreads for full context`);
    return [];
  }

  async sendReply(
    threadId: string,
    body: string,
  ): Promise<{ externalMessageId: string }> {
    // threadId is the PSID (Page-Scoped User ID) of the recipient for Send API
    // https://developers.facebook.com/docs/messenger-platform/reference/send-api
    //
    // Caller must inject page access token. In real flow the token is resolved
    // from platform_connections using the workspace context before calling sendReply.
    // For now we throw if no token is embedded in the threadId (format: "pageId::psid::token").
    const [pageId, psid, token] = threadId.split('::');
    if (!psid || !token) {
      throw new Error(
        'Facebook sendReply requires threadId in format "pageId::psid::accessToken"',
      );
    }

    const { data } = await axios.post(
      `${GRAPH_API}/me/messages`,
      {
        recipient: { id: psid },
        message: { text: body },
      },
      { params: { access_token: token } },
    );
    void pageId; // used implicitly via access_token scope
    return { externalMessageId: data.message_id };
  }

  async markAsRead(threadId: string, messageId: string): Promise<void> {
    // Messenger Read Receipts — send sender_action: mark_seen to the conversation
    const [, psid, token] = threadId.split('::');
    if (!psid || !token) return;
    await axios.post(
      `${GRAPH_API}/me/messages`,
      { recipient: { id: psid }, sender_action: 'mark_seen' },
      { params: { access_token: token } },
    ).catch((err) => {
      this.logger.warn(`markAsRead failed for message ${messageId}: ${err.message}`);
    });
  }
}
