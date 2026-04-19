# Current Backend Structure

## Overview

This repository is a NestJS backend for a social analytics platform that combines:

- Meta/Facebook and Instagram profile ingestion
- Background sync jobs with Bull + Redis
- PostgreSQL persistence through TypeORM
- UTM analytics backed by BigQuery and Postgres
- Revenue aggregation and team/page mappings
- Scheduled CSV email reporting

Core application wiring lives in `src/app.module.ts` and `src/main.ts`.

## Runtime Stack

- Framework: NestJS 11
- Language: TypeScript
- Database: PostgreSQL
- ORM: TypeORM
- Queue: Bull
- Cache/Broker: Redis
- Scheduler: `@nestjs/schedule`
- External APIs:
  - Meta Graph API
  - Google BigQuery
  - SMTP for report delivery

## Application Bootstrap

### `src/main.ts`

The application bootstrap currently does the following:

- creates the Nest app
- enables `cookie-parser`
- enables compression
- exposes a `/health` endpoint
- enables CORS using `FRONTEND_URL`
- listens on `PORT` or `5000`

### `src/app.module.ts`

The root module wires:

- `ConfigModule` as global
- `ScheduleModule`
- `TypeOrmModule.forRoot(...)`
- `BullModule.forRoot(...)`
- feature modules:
  - `AuthModule`
  - `FacebookModule`
  - `UtmAnalyticsModule`
  - `PageMappingsModule`
  - `BigQueryModule`
  - `RevenueModule`
  - `EmailReportsModule`

## Module Structure

### 1. Auth Module

Path: `src/modules/auth`

Responsibilities:

- admin user setup
- login/logout
- cookie-based auth
- global API guard registration

Key files:

- `auth.module.ts`
- `auth.controller.ts`
- `auth.service.ts`
- `entities/user.entity.ts`
- `src/common/guards/api-key.guard.ts`

Current behavior:

- the guard is registered globally using `APP_GUARD`
- auth relies on a persistent `apiKey` stored on the `users` table
- the `auth_token` cookie is matched directly against that DB token
- public routes are allowed through the `@Public()` decorator

### 2. Facebook Module

Path: `src/modules/facebook`

Responsibilities:

- Meta account connection flow
- page and Instagram profile onboarding
- historical and daily sync orchestration
- analytics snapshot storage
- post ingestion and deep-insight enrichment
- demographics sync
- revenue sync linkage for Facebook pages

Key files:

- `facebook.module.ts`
- `controllers/auth.Controller.ts`
- `controllers/analytics.controller.ts`
- `services/meta.service.ts`
- `services/cron.service.ts`
- `workers/sync.processor.ts`
- entity classes under `entities/`

Main flow:

1. frontend sends a Meta short-lived token
2. backend exchanges it for a long-lived token
3. backend fetches pages and linked Instagram accounts
4. selected profiles are persisted as active `SocialProfile` rows
5. Bull jobs are queued for historical sync
6. the worker fetches:
   - profile basics
   - daily analytics snapshots
   - posts
   - post-level insights
   - demographics
   - revenue breakdowns

### 3. UTM Analytics Module

Path: `src/modules/utm-analytics`

Responsibilities:

- querying daily UTM analytics
- aggregated reporting
- country and campaign breakdowns
- BigQuery sync/import
- legacy CSV import

Key files:

- `utm-analytics.module.ts`
- `utm-analytics.controller.ts`
- `utm-analytics.service.ts`
- `entities/daily-analytics.entity.ts`

Current design notes:

- most heavy aggregation is pushed to SQL through query builders
- several queries are already optimized to avoid loading excessive rows into Node

### 4. Revenue Module

Path: `src/modules/revenue`

Responsibilities:

- storing daily revenue by page/date
- storing page-to-team mappings
- exposing aggregated revenue metrics
- exposing mapping maintenance endpoints

Key files:

- `revenue.module.ts`
- `revenue.controller.ts`
- `revenue.service.ts`
- `entities/daily-revenue.entity.ts`
- `entities/revenue-mapping.entity.ts`

### 5. Page Mappings Module

Path: `src/modules/page-mappings`

Responsibilities:

- CRUD for page mappings
- CSV import
- batch team assignment

Key files:

- `page-mappings.module.ts`
- `page-mappings.controller.ts`
- `page-mappings.service.ts`
- `entities/page-mapping.entity.ts`

### 6. Email Reports Module

Path: `src/modules/email-reports`

Responsibilities:

- recipient management
- CSV generation for traffic, revenue, and Meta overview data
- scheduled email delivery
- manual test report sending

Key files:

- `email-reports.module.ts`
- `email-reports.controller.ts`
- `email-reports.service.ts`
- `csv-generators.service.ts`
- `entities/report-recipient.entity.ts`

Current behavior:

- SMTP config is read from env
- reports are sent on a fixed IST cron schedule
- report generation is attachment-based CSV output

### 7. BigQuery Module

Path: `src/common/bigquery`

Responsibilities:

- wraps the BigQuery client
- exposes `query()` and `queryStream()`

## Data Flow Summary

### Meta Analytics Flow

- `SocialProfile` stores connected pages/accounts and sync state
- `CronService` queues daily jobs
- `SyncProcessor` performs historical/daily sync
- `AnalyticsSnapshot` stores daily aggregates
- `SocialPost` stores post-level content and metrics
- `DemographicSnapshot` stores audience breakdowns
- `DailyRevenue` stores daily monetization values
- `RevenueMapping` links page IDs to business teams

### UTM Analytics Flow

- data is imported or synced into `DailyAnalytics`
- reporting endpoints query PostgreSQL aggregates
- BigQuery is used as the upstream analytics source

### Reporting Flow

- reporting service queries traffic, revenue, and Meta datasets
- CSV attachments are generated
- reports are sent through SMTP to configured recipients

## Current API Shape

The API currently uses mixed route conventions:

- `/api/auth/*`
- `/api/auth/meta/*`
- `/api/analytics/*`
- `/v1/analytics/*`
- `/v1/revenue/*`
- `/v1/email-reports/*`
- `/page-mappings`

This works, but the route versioning and naming are not yet fully standardized.

## Deployment Structure

### Local

`docker-compose.yml` defines:

- Postgres
- Redis
- backend container

### Production-shaped

`docker-compose.prod.yml` defines:

- Postgres
- Redis
- backend container with `.env.production`

Supporting files:

- `DockerFile`
- `deploy.sh`

## Current Strengths

- clear feature-module separation
- practical background-processing design for Meta sync workloads
- query-builder usage is generally moving expensive aggregation into the database
- reporting, analytics, and monetization concerns are already connected end-to-end
- Docker setup exists for local and production-like environments

## Current Risks And Gaps

### 1. Auth Model Needs Hardening

Current auth uses a persistent bearer-style token stored directly in the database and re-used across logins.

Risks:

- no expiration
- no server-side session lifecycle
- weak revocation model
- plaintext token persistence

### 2. Validation Is Incomplete

There is no global validation pipeline and many handlers accept raw `any` payloads or untyped query params.

Risks:

- malformed requests reach business logic
- inconsistent input rules across modules
- harder-to-maintain controllers

### 3. Schema Management Is Not Mature Yet

The backend currently relies on TypeORM `synchronize` behavior outside production and has no visible migration workflow.

Risks:

- schema drift between environments
- accidental destructive changes
- no auditable DB evolution path

### 4. Facebook Sync Worker Is Too Broad

`sync.processor.ts` currently owns too many responsibilities in a single job path:

- snapshots
- posts
- post insights
- demographics
- revenue
- revenue mapping maintenance

Risks:

- broad failure surface
- partial success is hard to reason about
- more difficult testing and debugging

### 5. Queue Scheduling Is Coarse

The daily cron skips all daily syncs when any jobs already exist in the queue.

Risk:

- one stuck or backlogged job can block freshness for all profiles

### 6. Tests Are Not Operational

Current state:

- `npm test` does not discover passing tests
- the only shipped e2e test is stale and does not match the actual app bootstrap

Risk:

- no trustworthy regression signal

### 7. Some Batch Endpoints Are Not Set-Based

Batch mapping updates currently loop and update one record at a time.

Risk:

- unnecessary DB round trips
- avoidable latency growth as records increase

## Recommended Refactor Plan

### Priority 1: Validation And Test Baseline

- add global `ValidationPipe`
- introduce DTOs for auth, Meta onboarding, analytics query params, revenue updates, and page mappings
- fix Jest configuration so tests are actually discovered
- replace the stale e2e test with current-route coverage

### Priority 2: Auth Hardening

- replace persistent plaintext `apiKey` auth with either:
  - signed session/JWT cookies, or
  - opaque hashed session tokens with expiry and revocation
- add session expiry
- add token rotation
- add login throttling

### Priority 3: Database Migrations

- move to explicit TypeORM migrations
- disable schema sync outside disposable environments
- establish a migration runbook for deploys

### Priority 4: Sync Worker Decomposition

- split the Facebook sync pipeline into smaller units
- separate sync-state tracking from per-step data ingestion
- make partial failure reporting explicit

### Priority 5: Queue And Batch Optimization

- replace whole-queue blocking logic with per-profile dedupe/idempotency
- convert batch mapping updates to set-based service methods

### Priority 6: API Surface Cleanup

- standardize route versioning
- align naming across `/api` and `/v1`
- move controller validation rules into DTOs consistently

## Suggested Near-Term Implementation Order

1. Fix validation and DTO coverage
2. Repair test discovery and add current e2e coverage
3. Harden auth/session handling
4. Introduce migrations and remove schema sync dependence
5. Decompose the Facebook sync worker
6. Optimize queue behavior and batch update patterns

## Current Document Purpose

This document reflects the backend as it exists now, not the ideal target state. It should be used as:

- a current-state architecture snapshot
- a handoff/reference document for backend work
- the baseline for future refactors and standardization
