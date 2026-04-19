import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpsCampaignsController } from './ops-campaigns.controller';
import { OpsCampaignsService } from './ops-campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignPostLink } from './entities/campaign-post-link.entity';
import { ContentPost } from '../schedule/entities/content-post.entity';
import { AuditModule } from '../../../common/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignPostLink, ContentPost]),
    AuditModule,
  ],
  controllers: [OpsCampaignsController],
  providers: [OpsCampaignsService],
})
export class OpsCampaignsModule {}
