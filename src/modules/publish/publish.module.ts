import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ContentPost } from '../ops/schedule/entities/content-post.entity';
import { ContentPublishAttempt } from '../ops/schedule/entities/content-publish-attempt.entity';
import { ContentPostProfile } from '../ops/campaigns/entities/content-post-profile.entity';
import { SocialProfile } from '../facebook/entities/SocialProfile.entity';
import { PlatformConnection } from '../inbox/entities/platform-connection.entity';
import { MetaPublishAdapter } from './adapters/meta-publish.adapter';
import { PlatformAdapterRegistry } from './platform-adapter.registry';
import { PublishService } from './publish.service';
import { PublishProcessor } from './publish.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentPost,
      ContentPublishAttempt,
      ContentPostProfile,
      SocialProfile,
      PlatformConnection,
    ]),
    BullModule.registerQueue({ name: 'publish' }),
  ],
  providers: [
    MetaPublishAdapter,
    PlatformAdapterRegistry,
    PublishService,
    PublishProcessor,
  ],
  exports: [PublishService],
})
export class PublishModule {}
