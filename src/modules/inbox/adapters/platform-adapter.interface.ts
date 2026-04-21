export interface InboxMessage {
  externalThreadId: string;
  externalMessageId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  mediaUrls?: string[];
  senderExternalId: string;
  senderName?: string;
  sentAt: Date;
}

export interface InboxThread {
  externalThreadId: string;
  externalProfileId: string;
  contact: {
    externalId: string;
    name?: string;
    avatarUrl?: string;
  };
  messages: InboxMessage[];
  lastMessageAt: Date;
}

export interface IPlatformInboxAdapter {
  platform: 'facebook' | 'instagram' | 'linkedin' | 'tiktok';
  fetchThreads(profileId: string, since: Date): Promise<InboxThread[]>;
  fetchMessages(threadId: string, since: Date): Promise<InboxMessage[]>;
  sendReply(threadId: string, body: string): Promise<{ externalMessageId: string }>;
  markAsRead(threadId: string, messageId: string): Promise<void>;
}
