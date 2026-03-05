import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { SocialProfile } from './entities/SocialProfile.entity';
import { AnalyticsSnapshot } from './entities/AnalyticsSnapshot.entity';
import { SocialPost } from './entities/SocialPost.entity';

import { AnalyticsController } from './controllers/analytics.controller';

import { CronService } from './services/cron.service';
import { SyncProcessor } from './workers/sync.processor';
import { AuthController } from './controllers/auth.Controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SocialProfile, AnalyticsSnapshot, SocialPost]),
    BullModule.registerQueue({
      name: 'social-sync-queue',
    }),
  ],
  controllers: [AnalyticsController, AuthController],
  providers: [CronService, SyncProcessor],
})
export class FacebookModule {}