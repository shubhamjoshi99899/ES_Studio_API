import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios, { AxiosError } from 'axios';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';
import {
  PlatformAuthException,
  PlatformTokenExpiredException,
  PlatformNotSupportedException,
} from '../exceptions/platform.exceptions';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';
const TOKEN_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class TikTokAdapter implements IPlatformInboxAdapter {
  readonly platform = 'tiktok' as const;
  private readonly logger = new Logger(TikTokAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  // ── Credential lookup ────────────────────────────────────────────────────

  private async getAccessToken(profileId: string): Promise<string> {
    const [row] = await this.dataSource.query<
      Array<{ access_token: string; token_expires_at: Date | null }>
    >(
      `SELECT access_token, token_expires_at FROM platform_connections
       WHERE external_profile_id = $1 AND platform = 'tiktok' AND status = 'active'
       LIMIT 1`,
      [profileId],
    );

    if (!row) {
      throw new PlatformAuthException(
        `No active TikTok connection for profile ${profileId}`,
      );
    }

    if (
      row.token_expires_at &&
      row.token_expires_at.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS
    ) {
      throw new PlatformTokenExpiredException(
        `TikTok token for profile ${profileId} expires within 24 h — refresh required`,
      );
    }

    return row.access_token;
  }

  // ── IPlatformInboxAdapter ────────────────────────────────────────────────

  async fetchThreads(profileId: string, since: Date): Promise<InboxThread[]> {
    const token = await this.getAccessToken(profileId);

    let videoData: any;
    try {
      ({ data: videoData } = await axios.get(`${TIKTOK_API}/video/list/`, {
        params: { fields: 'id,create_time,comment_count,username' },
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 401) {
        throw new PlatformAuthException(
          `TikTok token rejected for profile ${profileId} — re-authentication required`,
        );
      }
      throw err;
    }

    const threads: InboxThread[] = [];
    for (const video of (videoData.data?.videos ?? []) as any[]) {
      if (!video.comment_count || video.comment_count === 0) continue;

      const messages = await this.fetchMessages(video.id, since).catch((): InboxMessage[] => []);
      if (messages.length === 0) continue;

      const lastMessageAt = messages.reduce<Date>(
        (latest, m) => (m.sentAt > latest ? m.sentAt : latest),
        messages[0].sentAt,
      );

      threads.push({
        externalThreadId: video.id,
        externalProfileId: profileId,
        contact: {
          externalId: profileId,
          name: video.username ?? undefined,
        },
        messages,
        lastMessageAt,
      });
    }

    return threads;
  }

  async fetchMessages(threadId: string, since: Date): Promise<InboxMessage[]> {
    // threadId = TikTok videoId
    const [row] = await this.dataSource.query<Array<{ access_token: string }>>(
      `SELECT access_token FROM platform_connections
       WHERE platform = 'tiktok' AND status = 'active'
       LIMIT 1`,
    );
    if (!row) throw new PlatformAuthException('No active TikTok connection');

    let data: any;
    try {
      ({ data } = await axios.get(`${TIKTOK_API}/video/comment/list/`, {
        params: {
          video_id: threadId,
          fields: 'id,text,create_time,username,avatar_url',
        },
        headers: { Authorization: `Bearer ${row.access_token}` },
      }));
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 401) {
        throw new PlatformAuthException('TikTok token rejected — re-authentication required');
      }
      throw err;
    }

    const messages: InboxMessage[] = [];
    for (const comment of (data.data?.comments ?? []) as any[]) {
      const sentAt = new Date((comment.create_time ?? 0) * 1000);
      if (sentAt <= since) continue;

      messages.push({
        externalThreadId: threadId,
        externalMessageId: comment.id,
        direction: 'inbound',
        body: comment.text ?? '',
        senderExternalId: comment.username ?? '',
        senderName: comment.username ?? undefined,
        sentAt,
      });
    }

    return messages;
  }

  async sendReply(_threadId: string, _body: string): Promise<{ externalMessageId: string }> {
    throw new PlatformNotSupportedException(
      'TikTok does not support sending replies via API. ' +
      'Please reply directly in the TikTok app.',
    );
  }

  async markAsRead(_threadId: string, _messageId: string): Promise<void> {
    this.logger.log('TikTok markAsRead not supported by API — skipping');
  }
}
