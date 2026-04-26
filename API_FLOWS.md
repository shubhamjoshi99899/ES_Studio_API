# API Flows

This document explains how the currently integrated APIs work together in the backend, grouped by user journey instead of by module.

It is based on the current implementation in `src/`, not just the roadmap docs.

## 1. System Shape

The backend is made of these connected parts:

- Auth and workspace-scoped access
- Meta account connection and analytics ingestion
- UTM analytics and revenue reporting
- Ops workflows for team, scheduling, campaigns, alerts, inbox, and notifications
- Billing and plan enforcement

Shared infrastructure used across flows:

- PostgreSQL stores all persistent state
- Redis backs Bull queues and plan cache lookups
- Bull handles background jobs
- EventEmitter connects scheduling events to alerts and notifications
- SSE pushes real-time notifications to connected clients

## 2. Shared Rules Across Most Flows

### Authentication model

- `POST /api/auth/login` authenticates a user by email and password.
- `POST /api/auth/register` creates a new user and sends a verification email.
- `GET /api/auth/google` starts Google OAuth login/signup.
- `GET /api/auth/google/callback` completes Google OAuth and redirects the browser to the frontend.
- `GET /api/auth/verify-email?token=...` verifies a pending signup and redirects to onboarding.
- The API writes `access_token` and `refresh_token` cookies.
- `JwtAuthGuard` reads the `access_token` cookie on protected routes.
- `EmailVerifiedGuard` blocks authenticated but unverified users on non-public routes.
- The JWT payload includes:
  - `sub`
  - `email`
  - `workspaceId`

### Workspace scoping

- Most ops APIs are workspace-scoped.
- `@WorkspaceId()` reads the workspace from the authenticated JWT.
- The workspace is not passed in the request body for protected routes.

### Plan gating

- Some ops routes also use `PlanGuard(...)`.
- The current plan comes from the `workspaces.plan` column and is cached in Redis for 5 minutes.
- Starter plan allows:
  - `schedule`
  - `campaigns`
  - `team`
- Pro adds:
  - `alerts`
  - `inbox`
  - `automation`
- Enterprise allows everything.

## 3. Self-Serve Signup and Workspace Onboarding Flow

This is the default new-user path for the current auth stack.

### Flow

1. User opens the frontend signup page.
2. User chooses one of:
   - email/password via `POST /api/auth/register`
   - Google OAuth via `GET /api/auth/google`
3. Email signup stores the user with:
   - `emailVerified=false`
   - `verificationToken`
   - `verificationTokenExpiresAt`
4. Backend sends a verification email linking to `/verify-email?token=...`.
5. `GET /api/auth/verify-email` verifies the token, writes an `access_token` cookie, and redirects to the frontend onboarding route.
6. Google OAuth creates or resolves the user, writes an `access_token` cookie, and redirects:
   - new user: `/onboarding`
   - existing user with workspace: `/dashboard`
7. Frontend onboarding submits `POST /api/auth/workspace/create`.
8. Backend creates:
   - `workspaces`
   - `workspace_users`
   - `workspace_subscriptions`
9. Backend returns a workspace-aware JWT with `workspaceId` set.
10. Frontend redirects to `/dashboard`.

### Frontend routing contract

- no JWT: redirect user to `/signup`
- JWT with `workspaceId = null`: allow `/onboarding`
- JWT with `workspaceId` set: redirect `/onboarding` to `/dashboard`

### APIs involved

- `POST /api/auth/register`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/verify-email`
- `POST /api/auth/workspace/create`

### Tables involved

- `users`
- `workspaces`
- `workspace_users`
- `workspace_subscriptions`

### Common failure cases

- duplicate email:
  - `POST /api/auth/register` returns conflict
- slug taken:
  - `POST /api/auth/workspace/create` returns `409`
- invalid or expired verification token:
  - `GET /api/auth/verify-email` redirects to the frontend login page with an error marker

## 4. Bootstrap Flow

This is the first flow needed before most others work.

### Flow

1. Run migrations.
2. Create the first admin with `POST /api/auth/setup`.
3. Log in with `POST /api/auth/login`.
4. If the user belongs to multiple workspaces, call `POST /api/auth/switch-workspace`.
5. Use `GET /api/auth/me` to inspect:
   - current workspace
   - accessible workspaces
   - current role

### APIs involved

- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/switch-workspace`

### Tables involved

- `users`
- `sessions`
- `workspaces`
- `workspace_users`

### Important dependency

- Without a valid `workspace_users` row with `status='active'`, login can still succeed, but workspace-scoped APIs will not behave usefully.

## 5. Meta Connection and Historical Sync Flow

This flow connects Facebook Pages and Instagram accounts, stores them, and queues initial historical sync work.

### Flow

1. Frontend obtains a Meta short-lived token.
2. Client sends it to `POST /api/auth/meta/fetch-pages`.
3. Backend exchanges it for a long-lived token.
4. Backend fetches:
   - Facebook Pages
   - linked Instagram accounts
5. Client selects which profiles to keep.
6. Client sends the selected pages/accounts to `POST /api/auth/meta/confirm-pages`.
7. Backend:
   - upserts `social_profiles`
   - marks previous Facebook and Instagram profiles inactive
   - checks whether each profile needs historical backfill
   - queues Bull jobs for profiles that need sync

### APIs involved

- `POST /api/auth/meta/fetch-pages`
- `POST /api/auth/meta/confirm-pages`
- `GET /api/auth/meta/sync-status`
- `POST /api/auth/meta/disconnect`

### Tables involved

- `social_profiles`
- `analytics_snapshots`
- `social_posts`
- `demographic_snapshots`
- `daily_revenue`
- `revenue_mappings`

### Queue interaction

- `confirm-pages` adds historical sync jobs to the `social-sync-queue`.

### Disconnect behavior

`POST /api/auth/meta/disconnect` supports two modes:

- soft disconnect:
  - profiles marked inactive/disconnected
- hard disconnect with `deleteData=true`:
  - profiles deleted
  - snapshots deleted
  - posts deleted
  - demographics deleted
  - Facebook revenue and revenue mappings deleted

## 6. Meta Analytics Read Flow

This flow reads already-synced Meta analytics and returns dashboard/report data.

### Flow

1. Client requests analytics for one or more connected profiles.
2. Backend reads from normalized analytics tables.
3. For aggregate endpoints, the backend combines:
   - profile-level snapshots
   - post-level metrics
   - revenue rows
4. Responses are returned without forcing live sync in the request path.
5. Some endpoints may queue background historical sync if a data gap is detected.

### APIs involved

- `GET /api/analytics/profiles/list`
- `GET /api/analytics/demographics/:profileId`
- `POST /api/analytics/demographics/aggregate`
- `GET /api/analytics/:profileId/data`
- `GET /api/analytics/debug/:profileId`
- `POST /api/analytics/aggregate`
- `POST /api/analytics/aggregate/per-page`
- `POST /api/analytics/posts`
- `POST /api/analytics/profiles/:profileId/sync`

### Tables involved

- `social_profiles`
- `analytics_snapshots`
- `social_posts`
- `demographic_snapshots`
- `daily_revenue`

### Important interaction

`POST /api/analytics/aggregate` can trigger follow-up sync jobs when it detects missing snapshot coverage for the selected profiles.

This means the flow is:

1. read current data
2. detect gaps
3. queue repair sync in background
4. return current best response immediately

## 7. UTM Analytics Flow

This flow handles site/session analytics coming from BigQuery or imported CSV data.

### Flow

1. Data is synced from BigQuery or imported from legacy CSV.
2. Data lands in `daily_analytics`.
3. Reporting endpoints query `daily_analytics` using SQL aggregation.
4. Responses provide:
   - metrics
   - headlines
   - campaigns
   - country stats

### APIs involved

- `GET /v1/analytics/utm/metrics`
- `GET /v1/analytics/headlines`
- `GET /v1/analytics/utm/metrics-aggregated`
- `GET /v1/analytics/campaigns`
- `GET /v1/analytics/country-stats`
- `POST /v1/analytics/sync/manual`
- `POST /v1/analytics/import/legacy`

### Tables involved

- `daily_analytics`

### External dependency

- BigQuery is the upstream source for sync flows.
- CSV import is the fallback/manual ingestion path.

## 8. Revenue and Page Mapping Flow

This flow translates raw page/platform identifiers into business-facing team/category reporting.

### Revenue flow

1. Revenue is stored per page and date in `daily_revenue`.
2. Revenue endpoints aggregate totals over time.
3. Mapping endpoints align pages with teams.

### Page mapping flow

1. A page mapping row links:
   - category
   - team
   - platform
   - page name
   - UTM source
   - UTM mediums
2. CSV import can bulk load mappings.
3. Batch update endpoints reassign team ownership across multiple rows.

### APIs involved

Revenue:

- `GET /v1/revenue/metrics`
- `GET /v1/revenue/mappings`
- `PATCH /v1/revenue/mappings/batch/team`
- `PATCH /v1/revenue/mappings/:id`

Page mappings:

- `GET /page-mappings`
- `POST /page-mappings`
- `PATCH /page-mappings/batch/team`
- `PATCH /page-mappings/:id`
- `DELETE /page-mappings/:id`
- `POST /page-mappings/import`

### Tables involved

- `daily_revenue`
- `revenue_mappings`
- `page_mappings`

### Cross-module use

Revenue data is later reused by:

- Meta aggregate analytics
- campaign performance metrics
- alerts engine
- email reporting

## 8. Team Management Flow

This flow manages workspace members, invites, and audit visibility.

### Flow

1. Authenticated workspace user calls team endpoints.
2. Backend reads or writes workspace member records.
3. Invite creation:
   - creates a random token
   - hashes it
   - stores invite row
   - sends email through `MailService`
   - writes audit log
4. Role change:
   - updates `workspace_users.role`
   - writes audit log

### APIs involved

- `GET /api/ops/team/members`
- `POST /api/ops/team/invites`
- `PATCH /api/ops/team/members/:id/role`
- `GET /api/ops/team/audit-log`

### Tables involved

- `workspace_users`
- `workspace_invites`
- `audit_logs`

### External dependency

- Invite delivery depends on SMTP configuration.

## 9. Content Scheduling and Approval Flow

This is the core ops content workflow.

### Flow

1. User creates a post draft.
2. Draft can be updated or deleted.
3. Draft is submitted for review.
4. Reviewer either:
   - approves it
   - rejects it
5. Approved post can be scheduled.
6. State transitions emit a domain event.
7. The event triggers:
   - alert evaluation
   - in-app notification persistence
   - SSE broadcast

### APIs involved

- `POST /api/ops/schedule/posts`
- `GET /api/ops/schedule/posts`
- `GET /api/ops/schedule/posts/:id`
- `PATCH /api/ops/schedule/posts/:id`
- `DELETE /api/ops/schedule/posts/:id`
- `POST /api/ops/schedule/posts/:id/submit-for-review`
- `POST /api/ops/schedule/posts/:id/approve`
- `POST /api/ops/schedule/posts/:id/reject`
- `POST /api/ops/schedule/posts/:id/schedule`

### Tables involved

- `content_posts`
- `content_post_approvals`
- `audit_logs`

### State machine

- `draft -> review`
- `review -> approved`
- `review -> draft`
- `approved -> scheduled`
- internal future states also exist:
  - `scheduled -> published`
  - `scheduled -> failed`
  - `failed -> scheduled`

### Event chain

When a post state changes:

1. `OpsScheduleService` emits `post.status.changed`
2. `PostStatusChangedListener` receives it
3. listener calls `AlertEngineService.evaluateWorkspace(...)`
4. listener stores `in_app_notifications` row
5. listener pushes SSE event to the workspace

This is one of the key cross-module flows in the system.

## 10. Campaign Flow

Campaigns organize posts and derive performance metrics from linked content.

### Flow

1. Create a campaign.
2. Link existing content posts to it.
3. When campaign details are requested, the backend joins:
   - campaign-post links
   - content posts
   - content-post-profile links
   - social profiles
   - analytics snapshots
   - daily revenue
4. The response returns campaign performance metrics.

### APIs involved

- `POST /api/ops/campaigns`
- `GET /api/ops/campaigns`
- `GET /api/ops/campaigns/:id`
- `PATCH /api/ops/campaigns/:id`
- `DELETE /api/ops/campaigns/:id`
- `POST /api/ops/campaigns/:id/posts/:postId`
- `DELETE /api/ops/campaigns/:id/posts/:postId`

### Tables involved

- `campaigns`
- `campaign_post_links`
- `content_posts`
- `content_post_profiles`
- `social_profiles`
- `analytics_snapshots`
- `daily_revenue`

### Important dependency

Campaign reach and revenue depend on `content_post_profiles` being correctly populated, because that is what ties scheduled content to synced social profiles.

## 11. Alerts, Insights, Notifications, and SSE Flow

This is the alerting and real-time notification pipeline.

### Trigger paths

Alerts can be triggered by:

- explicit alert rule evaluation
- content post status changes
- billing failures
- inbox poll notifications

### Rule-based alert flow

1. Workspace user creates or updates alert rules.
2. `AlertEngineService` evaluates a workspace.
3. It queries metric families from:
   - `daily_analytics`
   - `daily_revenue`
4. If a rule fires, the service writes:
   - `insight_cards`
   - `in_app_notifications`
5. If email is enabled on the rule:
   - emails active workspace admins
6. It also pushes an SSE event through `NOTIFICATION_GATEWAY`

### APIs involved

- `GET /api/ops/alerts/rules`
- `POST /api/ops/alerts/rules`
- `PATCH /api/ops/alerts/rules/:id`
- `DELETE /api/ops/alerts/rules/:id`
- `GET /api/ops/alerts/insights`
- `GET /api/ops/notifications`
- `PATCH /api/ops/notifications/:id/read`
- `POST /api/ops/notifications/read-all`
- `GET /api/ops/notifications/stream`

### Tables involved

- `alert_rules`
- `insight_cards`
- `in_app_notifications`
- `workspace_users`
- `workspaces`

### Real-time delivery flow

1. Client opens `GET /api/ops/notifications/stream`
2. `SseController` registers the connection for the workspace
3. Any producer calling `gateway.sendToWorkspace(...)` pushes data to all live connections for that workspace

Current SSE producers include:

- `AlertEngineService`
- `PostStatusChangedListener`
- `StripeService`
- `InboxPollProcessor`

## 12. Inbox Flow

Inbox is a workspace-scoped messaging flow backed by platform adapters plus polling.

### Main concepts

- `platform_connections` tells the system which external inboxes to poll
- the processor runs every 5 minutes
- adapters fetch threads and messages from external platforms
- the backend upserts local contacts, threads, and messages
- new inbound activity emits workspace notifications

### Background polling flow

1. `InboxPollProcessor.enqueueAll()` runs on cron every 5 minutes.
2. It finds all active `platform_connections`.
3. It creates one queue job per connection.
4. The job handler:
   - chooses the correct platform adapter
   - fetches threads and messages since last sync
   - upserts `inbox_contacts`
   - upserts `inbox_threads`
   - upserts `inbox_messages`
   - updates `platform_connections.last_synced_at`
5. If new inbound unread messages were inserted:
   - sends SSE event to the workspace

### Inbox user flow

1. User lists threads.
2. User opens a thread.
3. User loads message history.
4. User updates thread state or assignee.
5. User sends a reply.
6. User creates internal notes.
7. User browses contacts.

### APIs involved

- `GET /api/ops/inbox/threads`
- `GET /api/ops/inbox/threads/:id`
- `PATCH /api/ops/inbox/threads/:id`
- `GET /api/ops/inbox/threads/:id/messages`
- `POST /api/ops/inbox/threads/:id/reply`
- `POST /api/ops/inbox/threads/:id/notes`
- `GET /api/ops/inbox/contacts`
- `GET /api/ops/inbox/contacts/:id`

### Tables involved

- `platform_connections`
- `inbox_contacts`
- `inbox_threads`
- `inbox_messages`
- `inbox_notes`

### Cross-module output

Inbox creates notifications through the same SSE channel used by alerts and billing.

## 13. Billing Flow

Billing controls subscription state and influences workspace plan access.

### Checkout flow

1. Authenticated workspace user calls `POST /api/billing/checkout`.
2. Backend resolves or creates a Stripe customer for the workspace.
3. Backend creates a Stripe Checkout session.
4. Client is redirected to Stripe-hosted checkout.

### Webhook flow

1. Stripe calls `POST /api/billing/webhook` with raw body.
2. Backend verifies webhook signature.
3. Depending on event type:
   - checkout completed
   - subscription updated
   - subscription deleted
   - invoice payment failed
4. Backend updates:
   - `workspace_subscriptions`
   - `workspaces.plan`
5. Payment failure also:
   - emails admins
   - sends SSE event to the workspace

### APIs involved

- `POST /api/billing/checkout`
- `POST /api/billing/webhook`
- `GET /api/billing/subscription`
- `POST /api/billing/cancel`

### Tables involved

- `workspace_subscriptions`
- `usage_records`
- `workspaces`
- `workspace_users`

### Cross-module effect

Billing changes `workspaces.plan`, and `PlanGuard(...)` uses that plan to allow or block access to:

- inbox
- alerts
- other plan-gated ops features

## 14. Email Reporting Flow

This flow packages analytics data into CSV attachments and sends reports to recipients.

### Flow

1. Recipients are managed through API.
2. Reporting service gathers:
   - traffic analytics
   - revenue
   - Meta overview data
3. CSV files are generated.
4. Email is sent through SMTP.

### APIs involved

- `GET /v1/email-reports/recipients`
- `POST /v1/email-reports/recipients`
- `DELETE /v1/email-reports/recipients/:id`
- `POST /v1/email-reports/send-test`

### Tables involved

- `report_recipients`
- `daily_analytics`
- `daily_revenue`
- Meta analytics tables used in the report generators

## 15. End-to-End Journeys

### Journey A: New workspace admin starts using the platform

1. Setup admin account
2. Login
3. Switch to workspace if needed
4. Connect Meta profiles
5. Wait for historical sync
6. Read Meta analytics and revenue dashboards
7. Create page mappings and team mappings

### Journey B: Content team runs campaign operations

1. Create campaign
2. Create content post drafts
3. Submit for review
4. Approve or reject
5. Schedule approved posts
6. Link posts to campaign
7. Read campaign metrics based on published post linkage

### Journey C: Alerts and real-time notifications

1. Create alert rule
2. Alert engine evaluates metrics
3. Rule fires
4. Insight and notification rows are created
5. Optional email is sent
6. SSE clients receive real-time notification

### Journey D: Inbox response workflow

1. Platform connection exists
2. Poller imports external threads/messages
3. New inbound messages trigger workspace notifications
4. Ops user opens thread
5. Ops user replies or adds note
6. Contact history remains queryable from inbox contacts endpoints

### Journey E: Subscription and feature access

1. Workspace starts checkout
2. Stripe webhook updates subscription state
3. Workspace plan is updated
4. PlanGuard changes access to gated ops features

## 16. Current Gaps and Constraints

- There is no public API in the current backend for creating a workspace itself.
- Some flows require pre-existing workspace and membership data.
- Billing env is currently required for boot because Stripe is constructed at service startup.
- Inbox depends on `platform_connections` being populated.
- Meta analytics quality depends on successful sync and available external tokens.
- The route surface is functional but still mixed across `/api/*`, `/v1/*`, and unversioned paths.

## 17. Recommended Reading Order

If someone new is trying to understand the product from the API layer, the best order is:

1. bootstrap and auth
2. workspace and team
3. Meta connect and analytics
4. scheduling and campaigns
5. alerts and notifications
6. inbox
7. billing
8. reporting
