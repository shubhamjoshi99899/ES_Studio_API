import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from './modules/auth/entities/user.entity';
import { Session } from './modules/auth/entities/session.entity';
import { ReportRecipient } from './modules/email-reports/entities/report-recipient.entity';
import { AnalyticsSnapshot } from './modules/facebook/entities/AnalyticsSnapshot.entity';
import { DemographicSnapshot } from './modules/facebook/entities/DemographicSnapshot.entity';
import { SocialPost } from './modules/facebook/entities/SocialPost.entity';
import { SocialProfile } from './modules/facebook/entities/SocialProfile.entity';
import { PageMapping } from './modules/page-mappings/entities/page-mapping.entity';
import { DailyRevenue } from './modules/revenue/entities/daily-revenue.entity';
import { RevenueMapping } from './modules/revenue/entities/revenue-mapping.entity';
import { DailyAnalytics } from './modules/utm-analytics/entities/daily-analytics.entity';
import { Workspace } from './modules/workspaces/entities/workspace.entity';
import { WorkspaceUser } from './modules/workspaces/entities/workspace-user.entity';
import { WorkspaceInvite } from './modules/workspaces/entities/workspace-invite.entity';
import { Campaign } from './modules/ops/campaigns/entities/campaign.entity';
import { CampaignPostLink } from './modules/ops/campaigns/entities/campaign-post-link.entity';
import { ContentPost } from './modules/ops/schedule/entities/content-post.entity';
import { ContentPostApproval } from './modules/ops/schedule/entities/content-post-approval.entity';
import { ContentPublishAttempt } from './modules/ops/schedule/entities/content-publish-attempt.entity';
import { AuditLog } from './common/audit/audit-log.entity';
import { ContentPostProfile } from './modules/ops/campaigns/entities/content-post-profile.entity';
import { AlertRule } from './modules/ops/alerts/entities/alert-rule.entity';
import { InsightCard } from './modules/ops/alerts/entities/insight-card.entity';
import { InAppNotification } from './modules/ops/alerts/entities/in-app-notification.entity';
import { InboxContact } from './modules/inbox/entities/inbox-contact.entity';
import { InboxThread } from './modules/inbox/entities/inbox-thread.entity';
import { InboxMessage } from './modules/inbox/entities/inbox-message.entity';
import { InboxNote } from './modules/inbox/entities/inbox-note.entity';
import { PlatformConnection } from './modules/inbox/entities/platform-connection.entity';
import { WorkspaceSubscription } from './modules/billing/entities/workspace-subscription.entity';
import { UsageRecord } from './modules/billing/entities/usage-record.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'social_studio_db',
  synchronize: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    User,
    Session,
    ReportRecipient,
    AnalyticsSnapshot,
    DemographicSnapshot,
    SocialPost,
    SocialProfile,
    PageMapping,
    DailyRevenue,
    RevenueMapping,
    DailyAnalytics,
    Workspace,
    WorkspaceUser,
    WorkspaceInvite,
    Campaign,
    CampaignPostLink,
    ContentPost,
    ContentPostApproval,
    ContentPublishAttempt,
    AuditLog,
    ContentPostProfile,
    AlertRule,
    InsightCard,
    InAppNotification,
    InboxContact,
    InboxThread,
    InboxMessage,
    InboxNote,
    PlatformConnection,
    WorkspaceSubscription,
    UsageRecord,
  ],
  migrations: ['src/migrations/*.ts'],
});
