import { Injectable } from '@nestjs/common';
import type { IPlatformInboxAdapter, InboxThread, InboxMessage } from './platform-adapter.interface';

// TODO: LinkedIn Messaging API docs:
// https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/messaging/messaging-api-overview

@Injectable()
export class LinkedInAdapter implements IPlatformInboxAdapter {
  readonly platform = 'linkedin' as const;

  async fetchThreads(_profileId: string, _since: Date): Promise<InboxThread[]> {
    // TODO: implement using LinkedIn Messaging API — Phase 3.5
    // Reference: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/messaging/messaging-api-overview
    throw new Error('LinkedIn adapter not implemented — Phase 3.5');
  }

  async fetchMessages(_threadId: string, _since: Date): Promise<InboxMessage[]> {
    // TODO: implement using LinkedIn Messaging API — Phase 3.5
    // Reference: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/messaging/messaging-api-overview
    throw new Error('LinkedIn adapter not implemented — Phase 3.5');
  }

  async sendReply(_threadId: string, _body: string): Promise<{ externalMessageId: string }> {
    // TODO: implement using LinkedIn Send Message API — Phase 3.5
    // Reference: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/messaging/messaging-api-overview
    throw new Error('LinkedIn adapter not implemented — Phase 3.5');
  }

  async markAsRead(_threadId: string, _messageId: string): Promise<void> {
    // TODO: implement using LinkedIn Messaging API — Phase 3.5
    // Reference: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/messaging/messaging-api-overview
    throw new Error('LinkedIn adapter not implemented — Phase 3.5');
  }
}
