import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FacebookModule } from './modules/facebook/facebook.module';
import { PostStatusChangedListener } from './listeners/post-status-changed.listener';
import { PageMappingsModule } from './modules/page-mappings/page-mappings.module';
import { BigQueryModule } from './common/bigquery/bigquery.module';
import { UtmAnalyticsModule } from './modules/utm-analytics/utm-analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { EmailReportsModule } from './modules/email-reports/email-reports.module';
import { OpsTeamModule } from './modules/ops/team/ops-team.module';
import { OpsScheduleModule } from './modules/ops/schedule/ops-schedule.module';
import { OpsCampaignsModule } from './modules/ops/campaigns/ops-campaigns.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OpsAlertsModule } from './modules/ops/alerts/ops-alerts.module';
import { InAppNotification } from './modules/ops/alerts/entities/in-app-notification.entity';
import { InboxModule } from './modules/inbox/inbox.module';
import { BillingModule } from './modules/billing/billing.module';
import { User } from './modules/auth/entities/user.entity';
import { EmailVerifiedGuard } from './guards/email-verified.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'social_studio_db',
      autoLoadEntities: true,
      synchronize: false,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),

    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      },
    }),
    TypeOrmModule.forFeature([InAppNotification, User]),
    AuthModule,
    FacebookModule,
    UtmAnalyticsModule,
    PageMappingsModule,
    BigQueryModule,
    RevenueModule,
    EmailReportsModule,
    OpsTeamModule,
    OpsScheduleModule,
    OpsCampaignsModule,
    NotificationsModule,
    OpsAlertsModule,
    InboxModule,
    BillingModule,
  ],
  controllers: [],
  providers: [
    PostStatusChangedListener,
    {
      provide: APP_GUARD,
      useClass: EmailVerifiedGuard,
    },
  ],
})
export class AppModule {}
