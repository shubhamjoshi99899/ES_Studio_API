import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios, { AxiosError } from 'axios';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';
import {
  PlatformAuthException,
  PlatformTokenExpiredException,
} from '../exceptions/platform.exceptions';

const LI_API = 'https://api.linkedin.com/v2';
const TOKEN_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class LinkedInAdapter implements IPlatformInboxAdapter {
  readonly platform = 'linkedin' as const;
  private readonly logger = new Logger(LinkedInAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  // ── Credential lookup ────────────────────────────────────────────────────

  private async getAccessToken(profileId: string): Promise<string> {
    const [row] = await this.dataSource.query<
      Array<{ access_token: string; token_expires_at: Date | null }>
    >(
      `SELECT access_token, token_expires_at FROM platform_connections
       WHERE external_profile_id = $1 AND platform = 'linkedin' AND status = 'active'
       LIMIT 1`,
      [profileId],
    );

    if (!row) {
      throw new PlatformAuthException(
        `No active LinkedIn connection for profile ${profileId}`,
      );
    }

    if (
      row.token_expires_at &&
      row.token_expires_at.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS
    ) {
      throw new PlatformTokenExpiredException(
        `LinkedIn token for profile ${profileId} expires within 24 h — refresh required`,
      );
    }

    return row.access_token;
  }

  // ── IPlatformInboxAdapter ────────────────────────────────────────────────

  async fetchThreads(profileId: string, since: Date): Promise<InboxThread[]> {
    const token = await this.getAccessToken(profileId);

    let data: any;
    try {
      ({ data } = await axios.get(`${LI_API}/messages`, {
        params: {
          q: 'memberAndThread',
          recipients: `urn:li:person:${profileId}`,
          sort: 'LAST_ACTIVITY',
        },
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 401) {
        throw new PlatformAuthException(
          `LinkedIn token rejected for profile ${profileId} — re-authentication required`,
        );
      }
      throw err;
    }

    const threads: InboxThread[] = [];
    for (const thread of (data.elements ?? []) as any[]) {
      const lastActivityAt = new Date(thread.lastActivityAt ?? 0);
      if (lastActivityAt <= since) continue;

      const participants: any[] = thread.recipients?.values ?? [];
      const contact = participants.find(
        (p: any) => p.entityUrn !== `urn:li:person:${profileId}`,
      );

      const messages = await this.fetchMessages(thread.entityUrn, since).catch(() => []);

      threads.push({
        externalThreadId: thread.entityUrn,
        externalProfileId: profileId,
        contact: {
          externalId: contact?.entityUrn ?? '',
          name: contact?.firstName?.localized?.en_US
            ? `${contact.firstName.localized.en_US} ${contact.lastName?.localized?.en_US ?? ''}`.trim()
            : undefined,
          avatarUrl: contact?.profilePicture?.displayImage ?? undefined,
        },
        messages,
        lastMessageAt: lastActivityAt,
      });
    }

    return threads;
  }

  async fetchMessages(threadId: string, since: Date): Promise<InboxMessage[]> {
    // threadId = urn:li:messagingThread:{id} — extract the raw thread id for the query
    const rawThreadId = threadId.startsWith('urn:li:messagingThread:')
      ? threadId
      : `urn:li:messagingThread:${threadId}`;

    // We need a profileId to get a token; threads store it in the URN but we can't
    // derive it here. Use a placeholder approach: resolve token from any active
    // linkedin connection (caller context guarantees at most one per workspace).
    const [row] = await this.dataSource.query<Array<{ access_token: string }>>(
      `SELECT access_token FROM platform_connections
       WHERE platform = 'linkedin' AND status = 'active'
       LIMIT 1`,
    );
    if (!row) throw new PlatformAuthException('No active LinkedIn connection');

    const token = row.access_token;

    let data: any;
    try {
      ({ data } = await axios.get(`${LI_API}/messages`, {
        params: {
          q: 'thread',
          thread: rawThreadId,
        },
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 401) {
        throw new PlatformAuthException('LinkedIn token rejected — re-authentication required');
      }
      throw err;
    }

    const messages: InboxMessage[] = [];
    for (const msg of (data.elements ?? []) as any[]) {
      const sentAt = new Date(msg.createdAt ?? 0);
      if (sentAt <= since) continue;

      messages.push({
        externalThreadId: threadId,
        externalMessageId: msg.entityUrn ?? msg.id,
        direction: 'inbound',
        body: msg.body?.text ?? '',
        senderExternalId: msg.sender?.entityUrn ?? '',
        senderName: msg.sender?.firstName?.localized?.en_US ?? undefined,
        sentAt,
      });
    }

    return messages;
  }

  async sendReply(
    threadId: string,
    body: string,
  ): Promise<{ externalMessageId: string }> {
    // Resolve token same way as fetchMessages
    const [row] = await this.dataSource.query<Array<{ access_token: string }>>(
      `SELECT access_token FROM platform_connections
       WHERE platform = 'linkedin' AND status = 'active'
       LIMIT 1`,
    );
    if (!row) throw new PlatformAuthException('No active LinkedIn connection');

    const { data } = await axios.post(
      `${LI_API}/messages`,
      {
        recipients: [{ person: { id: threadId } }],
        body: { text: body },
        messageType: 'MEMBER_TO_MEMBER',
      },
      { headers: { Authorization: `Bearer ${row.access_token}` } },
    );

    return { externalMessageId: data.id ?? data.entityUrn };
  }

  async markAsRead(_threadId: string, _messageId: string): Promise<void> {
    // LinkedIn does not have a direct markAsRead endpoint
    this.logger.log('LinkedIn markAsRead not supported');
  }
}
