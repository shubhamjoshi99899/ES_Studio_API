import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEngineService } from './alert-engine.service';
import { OpsAlertsController } from './ops-alerts.controller';
import { OpsAlertsService } from './ops-alerts.service';
import { AlertRule } from './entities/alert-rule.entity';
import { InsightCard } from './entities/insight-card.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { MailModule } from '../../../common/mail/mail.module';
import { AuditModule } from '../../../common/audit/audit.module';
import { NotificationsModule } from '../../../notifications/notifications.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlertRule,
      InsightCard,
      InAppNotification,
      Workspace,
      WorkspaceUser,
    ]),
    MailModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [OpsAlertsController],
  providers: [AlertEngineService, OpsAlertsService],
  exports: [AlertEngineService],
})
export class OpsAlertsModule {}
