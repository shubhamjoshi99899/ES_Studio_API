import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../../common/audit/audit.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

import { InboxContact } from './entities/inbox-contact.entity';
import { InboxThread } from './entities/inbox-thread.entity';
import { InboxMessage } from './entities/inbox-message.entity';
import { InboxNote } from './entities/inbox-note.entity';
import { PlatformConnection } from './entities/platform-connection.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceSubscription } from '../billing/entities/workspace-subscription.entity';

import { MetaFacebookAdapter } from './adapters/meta-facebook.adapter';
import { MetaInstagramAdapter } from './adapters/meta-instagram.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { TikTokAdapter } from './adapters/tiktok.adapter';

import { InboxService } from './inbox.service';
import { InboxPollProcessor } from './inbox-poll.processor';
import { OpsInboxService } from './ops-inbox.service';
import { OpsInboxController } from './ops-inbox.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InboxContact,
      InboxThread,
      InboxMessage,
      InboxNote,
      PlatformConnection,
      Workspace,
      WorkspaceSubscription,
    ]),
    AuditModule,
    BullModule.registerQueue({ name: 'inbox-poll' }),
    NotificationsModule,
    AuthModule,
  ],
  controllers: [OpsInboxController],
  providers: [
    // Adapters
    MetaFacebookAdapter,
    MetaInstagramAdapter,
    LinkedInAdapter,
    TikTokAdapter,

    // Factory — InboxService resolves the correct adapter by platform string.
    // To add a new platform: add one adapter class above and include it in the array below.
    {
      provide: 'INBOX_ADAPTERS',
      useFactory: (
        fb: MetaFacebookAdapter,
        ig: MetaInstagramAdapter,
        li: LinkedInAdapter,
        tt: TikTokAdapter,
      ) => [fb, ig, li, tt],
      inject: [MetaFacebookAdapter, MetaInstagramAdapter, LinkedInAdapter, TikTokAdapter],
    },

    InboxService,
    InboxPollProcessor,
    OpsInboxService,
  ],
  exports: [InboxService],
})
export class InboxModule {}
