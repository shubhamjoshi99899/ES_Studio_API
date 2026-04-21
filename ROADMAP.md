# SocialMetrics — Phase 2 brief

## Status
Phase 1 committed and tagged at v0.1-phase1. Build clean. All tests passing.

## What Phase 2 must deliver
1. Alerts engine — rule evaluation job + in_app_notifications writer
2. Insights feed — insight_cards generated from analytics aggregates  
3. Real-time SSE layer — /api/ops/notifications/stream endpoint
4. content_post_profiles mapping table — fixes total_reach + total_revenue returning 0
5. Real SMTP — replace MailService stdout stub with nodemailer + ConfigService
6. PostStatusChangedListener — replace stdout log with real alert + notification consumers

## Known gaps carried from Phase 1
- `getCampaign` metrics: total_reach and total_revenue return 0
  Root cause: no FK between analytics_snapshots/daily_revenue and content_posts
  Fix: create content_post_profiles (post_id, profile_id) mapping table, 
  join through it in OpsCampaignsService.getCampaign()
- MailService.sendInvite() logs token prefix to stdout only
  Fix: inject nodemailer transporter, load SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS 
  from ConfigService
- PostStatusChangedListener logs to stdout only
  Fix: wire @OnEvent('post.status.changed') to alert rule evaluator 
  and notification writer

## New tables needed
alert_rules:
  id, workspace_id (FK), name, metric_family (traffic|revenue|engagement),
  operator (gt|lt|pct_drop|pct_rise), threshold (numeric), 
  time_window (1d|7d|30d), channels (text[]: in_app|email),
  enabled (boolean), last_evaluated (timestamp), last_triggered (timestamp nullable)

in_app_notifications:
  id, workspace_id (FK), user_id (FK nullable — null = broadcast to workspace),
  type, title, body, read_at (timestamp nullable), created_at

insight_cards:
  id, workspace_id (FK), type, severity (positive|warning|critical|neutral),
  title, body, payload (jsonb), created_at, expires_at (timestamp nullable)

## Alert evaluation logic
- Bull job runs every hour
- Queries existing DailyAnalytics and DailyRevenue aggregates — no new data sources
- When rule fires: writes insight_card row + in_app_notification row
- Channels: in_app always, email if rule.channels includes 'email'

## SSE layer
- GET /api/ops/notifications/stream — protected, workspace-scoped
- Emits notification events to connected clients in real time
- Use @nestjs/sse or raw Response with Content-Type: text/event-stream
- Client reconnect handled via Last-Event-ID header

## Priority order for Phase 2 Claude Code session
1. content_post_profiles fix (unblocks real campaign metrics)
2. Migration 006 (alert_rules + in_app_notifications + insight_cards)
3. Real SMTP via nodemailer
4. Alert rule engine + Bull job
5. PostStatusChangedListener → alert + notification consumers
6. Insights feed generator
7. SSE endpoint + client integration
8. E2E tests for alert firing + SSE delivery

## Open decisions to confirm before coding
- Email provider: nodemailer direct or SES? (recommendation: SES via nodemailer transport)
- SSE vs WebSocket: SSE for now (simpler, no extra infra), WebSocket in Phase 4+
- Insight card expiry: default 7 days unless severity is critical (no expiry)
- Alert evaluation: hourly cron or trigger on every PostStatusChangedEvent? 
  (recommendation: hourly cron + immediate eval on status change)

## Env vars needed before Phase 2 starts
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ALERT_EVAL_CRON="0 * * * *"

## Phase 4 — remaining work

### Must do before Phase 4 starts
- [ ] Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, 
      STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE in .env
- [ ] Test Stripe webhook locally with Stripe CLI:
      stripe listen --forward-to localhost:3000/api/billing/webhook

### Phase 4 scope
1. WebSocket gateway — replace SseNotificationGateway with real WS
   (stub already exists, tagged Phase 4 in SseGateway)
2. LinkedIn adapter — real API calls replacing Phase 3.5 stub
3. TikTok adapter — real API calls replacing Phase 3.5 stub  
4. PlanGuard → StripeService.enforcePlan() — wire Redis-cached plan 
   check to live subscription status, not just workspace.plan column
5. platform_connections onboarding flow — UI + backend for connecting
   new social accounts per workspace
6. White-label + custom reports (Phase 6 in original roadmap)
7. SSO/SAML for enterprise workspaces
8. Mobile PWA — inbox approvals on mobile
9. Public API + webhooks — let customers build on SocialMetrics data

### Monetisation gate
Before Phase 4 starts, the product is billable:
- Stripe checkout live
- Plan enforcement live (402/403)
- Meta inbox real
- Workspace switcher working
Ship to first paying customer before writing Phase 4 code.