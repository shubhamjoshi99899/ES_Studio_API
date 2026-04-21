import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceSubscription } from './entities/workspace-subscription.entity';
import { UsageRecord } from './entities/usage-record.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../workspaces/entities/workspace-user.entity';

import { StripeService } from './stripe.service';
import { BillingController } from './billing.controller';
import { MailModule } from '../../common/mail/mail.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceSubscription,
      UsageRecord,
      Workspace,
      WorkspaceUser,
    ]),
    MailModule,
    NotificationsModule,
  ],
  controllers: [BillingController],
  providers: [StripeService],
  exports: [StripeService],
})
export class BillingModule {}
