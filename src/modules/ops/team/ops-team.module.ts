import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpsTeamController } from './ops-team.controller';
import { OpsTeamService } from './ops-team.service';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { WorkspaceInvite } from '../../workspaces/entities/workspace-invite.entity';
import { AuditLog } from '../../../common/audit/audit-log.entity';
import { AuditModule } from '../../../common/audit/audit.module';
import { MailModule } from '../../../common/mail/mail.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceUser, WorkspaceInvite, AuditLog]),
    AuditModule,
    MailModule,
    AuthModule,
  ],
  controllers: [OpsTeamController],
  providers: [OpsTeamService],
})
export class OpsTeamModule {}
