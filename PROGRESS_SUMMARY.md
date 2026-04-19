# ES Studio API Progress Summary

## Snapshot

The backend is now in a usable Phase 1 state for core analytics plus the new ops foundation. The codebase includes operational CRUD modules, auth hardening, migrations, audit logging, and a Docker-backed local run path.

## Delivered So Far

### Platform and security

- Global `ValidationPipe` enabled with whitelist, transform, and non-whitelisted field rejection.
- Cookie-based JWT auth added with access-token and refresh-token flows.
- Refresh sessions are persisted with bcrypt-hashed tokens.
- `JwtAuthGuard`, `SetupGuard`, `@WorkspaceId()` decorator, and `PlanGuard()` were introduced.

### Database and migrations

- Baseline schema and migrations are in place:
  - `001-baseline`
  - `002-add-sessions`
  - `003-add-workspaces`
  - `004-add-content-posts`
  - `005-add-audit-logs`
- TypeORM data source is available for both local and container migration runs.

### Ops foundation

- `OpsTeamModule`
  - list members
  - create invites
  - update member roles
  - audit-log pagination
- `OpsScheduleModule`
  - content post CRUD
  - explicit workflow transitions:
    - `draft -> review`
    - `review -> approved`
    - `review -> draft`
    - `approved -> scheduled`
    - `scheduled -> published`
    - `scheduled -> failed`
    - `failed -> scheduled`
- `OpsCampaignsModule`
  - campaign CRUD
  - post linking and unlinking

### Infrastructure

- Append-only `AuditService` logs every write-side action in the new ops modules.
- `EventEmitter2` is wired and emits `PostStatusChangedEvent`.
- `PostStatusChangedListener` is connected.
- `MailService` exists as a stub for invite emails.
- Email report delivery already supports SMTP when configured.

### Existing analytics surface retained

- Meta auth/connect flow
- Meta analytics aggregation endpoints
- UTM analytics endpoints
- Revenue mapping and metrics endpoints
- Page-mapping import and CRUD
- Email report recipient management and test-send endpoint

## Verification Status

- `npm run build`: passing
- `npm test -- --runInBand`: passing
- Current verified commit from this phase: `652f52c`

## Important Current Constraints

### Ops auth gap

Ops endpoints require `workspaceId` in the JWT payload through `@WorkspaceId()`. The current `/api/auth/login` flow issues JWTs without `workspaceId`, so a normal login cookie is not yet sufficient to use the ops routes end-to-end. This is the main functional gap left between auth hardening and full workspace-aware ops usage.

### Known product gaps carried into Phase 2

- Campaign metrics `total_reach` and `total_revenue` currently return `0` until content-post-to-profile mapping is added.
- Invite mail delivery uses a logger stub, not production SMTP.
- `PostStatusChangedListener` currently logs only; no downstream alerting consumers are attached yet.
- BigQuery- and Meta-dependent endpoints still require external credentials and upstream data access.

## Recommended Next Phase

1. Add workspace-aware login/session issuance so ops APIs become usable from the standard auth flow.
2. Introduce content-post to social-profile mapping for real campaign reach and revenue attribution.
3. Replace invite-email stub with real SMTP delivery.
4. Add alert consumers for status-change events.
5. Add Swagger or generated OpenAPI so request contracts stop living only in controller/DTO code.
