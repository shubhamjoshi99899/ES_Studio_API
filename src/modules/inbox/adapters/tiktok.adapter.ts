import { Injectable } from '@nestjs/common';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';

// TODO: TikTok DM API docs:
// https://developers.tiktok.com/products/direct-messages/

@Injectable()
export class TikTokAdapter implements IPlatformInboxAdapter {
  readonly platform = 'tiktok' as const;

  async fetchThreads(_profileId: string, _since: Date): Promise<InboxThread[]> {
    // TODO: implement using TikTok DM API — Phase 3.5
    // Reference: https://developers.tiktok.com/products/direct-messages/
    throw new Error('TikTok adapter not implemented — Phase 3.5');
  }

  async fetchMessages(_threadId: string, _since: Date): Promise<InboxMessage[]> {
    // TODO: implement using TikTok DM API — Phase 3.5
    // Reference: https://developers.tiktok.com/products/direct-messages/
    throw new Error('TikTok adapter not implemented — Phase 3.5');
  }

  async sendReply(_threadId: string, _body: string): Promise<{ externalMessageId: string }> {
    // TODO: implement using TikTok DM API — Phase 3.5
    // Reference: https://developers.tiktok.com/products/direct-messages/
    throw new Error('TikTok adapter not implemented — Phase 3.5');
  }

  async markAsRead(_threadId: string, _messageId: string): Promise<void> {
    // TODO: implement using TikTok DM API — Phase 3.5
    // Reference: https://developers.tiktok.com/products/direct-messages/
    throw new Error('TikTok adapter not implemented — Phase 3.5');
  }
}
