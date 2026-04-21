import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Cron } from '@nestjs/schedule';
import { Repository, DataSource } from 'typeorm';
import type { Job, Queue } from 'bull';

import { InboxContact } from './entities/inbox-contact.entity';
import { InboxThread } from './entities/inbox-thread.entity';
import { InboxMessage } from './entities/inbox-message.entity';
import { PlatformConnection } from './entities/platform-connection.entity';
import { InboxService } from './inbox.service';
import type { INotificationGateway } from '../../notifications/notification.gateway';
import type { InboxPlatform } from './entities/inbox-contact.entity';

// ── Job payload ──────────────────────────────────────────────────────────────

export interface InboxPollJobData {
  workspaceId: string;
  profileId: string;
  platform: InboxPlatform;
  since: Date;
}

// ── Processor ────────────────────────────────────────────────────────────────

@Processor('inbox-poll')
@Injectable()
export class InboxPollProcessor {
  private readonly logger = new Logger(InboxPollProcessor.name);

  constructor(
    @InjectRepository(InboxContact)
    private readonly contactRepo: Repository<InboxContact>,
    @InjectRepository(InboxThread)
    private readonly threadRepo: Repository<InboxThread>,
    @InjectRepository(InboxMessage)
    private readonly messageRepo: Repository<InboxMessage>,
    @InjectRepository(PlatformConnection)
    private readonly connectionRepo: Repository<PlatformConnection>,
    private readonly inboxService: InboxService,
    private readonly dataSource: DataSource,
    @InjectQueue('inbox-poll')
    private readonly inboxQueue: Queue<InboxPollJobData>,
    @Inject('NOTIFICATION_GATEWAY')
    private readonly gateway: INotificationGateway,
  ) {}

  // ── Cron enqueuer — runs every 5 minutes ────────────────────────────────

  @Cron('*/5 * * * *')
  async enqueueAll(): Promise<void> {
    const connections = await this.connectionRepo.find({
      where: { status: 'active' },
    });

    for (const conn of connections) {
      const since = conn.lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Job deduplication: drop if previous job for this connection hasn't finished
      const jobId = `${conn.workspaceId}-${conn.platform}-${conn.externalProfileId}`;

      await this.inboxQueue.add(
        {
          workspaceId: conn.workspaceId,
          profileId: conn.externalProfileId,
          platform: conn.platform,
          since,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
        },
      );
    }

    this.logger.debug(`Enqueued inbox-poll jobs for ${connections.length} connections`);
  }

  // ── Bull job handler ─────────────────────────────────────────────────────

  @Process()
  async handlePoll(job: Job<InboxPollJobData>): Promise<void> {
    const { workspaceId, profileId, platform, since } = job.data;
    this.logger.debug(`inbox-poll start workspace=${workspaceId} platform=${platform} profile=${profileId}`);

    try {
      const adapter = this.inboxService.getAdapter(platform);
      const threads = await adapter.fetchThreads(profileId, new Date(since));

      let newInboundCount = 0;

      for (const thread of threads) {
        // 1. Upsert contact
        await this.dataSource.query(
          `INSERT INTO inbox_contacts
             (workspace_id, platform, external_id, name, avatar_url, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (workspace_id, platform, external_id)
           DO UPDATE SET
             name       = EXCLUDED.name,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = now()`,
          [
            workspaceId,
            platform,
            thread.contact.externalId,
            thread.contact.name ?? null,
            thread.contact.avatarUrl ?? null,
          ],
        );

        const [contactRow] = await this.dataSource.query<Array<{ id: string }>>(
          `SELECT id FROM inbox_contacts
           WHERE workspace_id = $1 AND platform = $2 AND external_id = $3`,
          [workspaceId, platform, thread.contact.externalId],
        );

        // 2. Upsert thread
        await this.dataSource.query(
          `INSERT INTO inbox_threads
             (workspace_id, platform, external_thread_id, external_profile_id,
              contact_id, status, last_message_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'open', $6, now())
           ON CONFLICT (workspace_id, platform, external_thread_id)
           DO UPDATE SET
             contact_id      = EXCLUDED.contact_id,
             last_message_at = GREATEST(inbox_threads.last_message_at, EXCLUDED.last_message_at),
             updated_at      = now()`,
          [
            workspaceId,
            platform,
            thread.externalThreadId,
            thread.externalProfileId,
            contactRow?.id ?? null,
            thread.lastMessageAt,
          ],
        );

        const [threadRow] = await this.dataSource.query<Array<{ id: string }>>(
          `SELECT id FROM inbox_threads
           WHERE workspace_id = $1 AND platform = $2 AND external_thread_id = $3`,
          [workspaceId, platform, thread.externalThreadId],
        );

        if (!threadRow) continue;

        // 3. Upsert messages
        for (const msg of thread.messages) {
          const result = await this.dataSource.query(
            `INSERT INTO inbox_messages
               (thread_id, workspace_id, external_message_id, direction,
                body, media_urls, sender_external_id, sender_name, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (thread_id, external_message_id) DO NOTHING
             RETURNING id, direction, read_at`,
            [
              threadRow.id,
              workspaceId,
              msg.externalMessageId,
              msg.direction,
              msg.body,
              msg.mediaUrls?.length ? msg.mediaUrls : null,
              msg.senderExternalId,
              msg.senderName ?? null,
              msg.sentAt,
            ],
          );

          // Count newly inserted inbound unread messages
          if (result?.length && result[0].direction === 'inbound' && !result[0].read_at) {
            newInboundCount++;
          }
        }

        // 4. Update thread.last_message_at to the most recent message
        await this.dataSource.query(
          `UPDATE inbox_threads
           SET last_message_at = (
             SELECT MAX(created_at) FROM inbox_messages WHERE thread_id = $1
           ), updated_at = now()
           WHERE id = $1`,
          [threadRow.id],
        );
      }

      // 4. Emit notification for new inbound messages
      if (newInboundCount > 0) {
        await this.gateway.sendToWorkspace(workspaceId, {
          type: 'inbox.new_messages',
          title: 'New inbox messages',
          body: `You have ${newInboundCount} new message${newInboundCount > 1 ? 's' : ''} on ${platform}`,
          payload: { platform, profileId, count: newInboundCount },
          createdAt: new Date(),
        });
      }

      // 5. Update platform_connections.last_synced_at
      await this.connectionRepo.update(
        { workspaceId, platform, externalProfileId: profileId },
        { lastSyncedAt: new Date(), status: 'active' },
      );

      this.logger.debug(
        `inbox-poll done workspace=${workspaceId} platform=${platform} threads=${threads.length} newInbound=${newInboundCount}`,
      );
    } catch (err) {
      this.logger.error(
        `inbox-poll error workspace=${workspaceId} platform=${platform}: ${(err as Error).message}`,
      );
      // Per-connection error: mark connection as error, do not rethrow (so other jobs continue)
      await this.connectionRepo.update(
        { workspaceId, platform, externalProfileId: profileId },
        { status: 'error' },
      ).catch(() => undefined);

      throw err; // re-throw so Bull counts the attempt and applies exponential backoff
    }
  }
}
