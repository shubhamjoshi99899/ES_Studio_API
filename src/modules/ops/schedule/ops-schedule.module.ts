import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpsScheduleController } from './ops-schedule.controller';
import { OpsScheduleService } from './ops-schedule.service';
import { ContentPost } from './entities/content-post.entity';
import { ContentPostApproval } from './entities/content-post-approval.entity';
import { AuditModule } from '../../../common/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentPost, ContentPostApproval]),
    AuditModule,
  ],
  controllers: [OpsScheduleController],
  providers: [OpsScheduleService],
  exports: [OpsScheduleService],
})
export class OpsScheduleModule {}
